terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — store in S3 + DynamoDB lock table
  # Replace bucket/table names before first apply
  backend "s3" {
    bucket         = "lumigift-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "lumigift-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# ─── PostgreSQL (RDS) ─────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "lumigift-${var.env}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "postgres" {
  identifier             = "lumigift-${var.env}"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  db_name                = "lumigift"
  username               = "lumigift"
  password               = var.db_password   # injected from secret store — never hardcoded
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = var.env != "prod"
  deletion_protection    = var.env == "prod"
  storage_encrypted      = true

  tags = local.tags
}

# ─── Redis (ElastiCache) ──────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "lumigift-${var.env}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "lumigift-${var.env}"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  tags = local.tags
}

# ─── Compute — ECS Fargate (Blue/Green) ──────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "lumigift-${var.env}"
  tags = local.tags
}

resource "aws_alb" "main" {
  name               = "lumigift-${var.env}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  tags = local.tags
}

resource "aws_alb_target_group" "blue" {
  name        = "lumigift-${var.env}-blue"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = local.tags
}

resource "aws_alb_target_group" "green" {
  name        = "lumigift-${var.env}-green"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = local.tags
}

resource "aws_alb_listener" "http" {
  load_balancer_arn = aws_alb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.blue.arn
  }

  lifecycle {
    ignore_changes = [default_action] # Managed by CodeDeploy during blue-green
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "lumigift-${var.env}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "app"
      image = var.app_image
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" }
      ]
      secrets = [
        { name = "DATABASE_URL", value_from = aws_secretsmanager_secret.db_url.arn },
        { name = "REDIS_URL", value_from = aws_secretsmanager_secret.redis_url.arn },
        { name = "NEXTAUTH_SECRET", value_from = aws_secretsmanager_secret.nextauth_secret.arn },
        { name = "CRON_SECRET", value_from = aws_secretsmanager_secret.cron_secret.arn }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "app" {
  name            = "lumigift-${var.env}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.app.id]
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.blue.arn
    container_name   = "app"
    container_port   = 3000
  }

  deployment_controller {
    type = "CODE_DEPLOY"
  }

  lifecycle {
    ignore_changes = [load_balancer, task_definition] # Managed by CodeDeploy
  }

  tags = local.tags
}

# ─── IAM Roles ────────────────────────────────────────────────────────────────

resource "aws_iam_role" "ecs_execution" {
  name = "lumigift-${var.env}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_secrets" {
  name = "lumigift-${var.env}-ecs-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = "secretsmanager:GetSecretValue"
      Effect   = "Allow"
      Resource = [
        aws_secretsmanager_secret.db_url.arn,
        aws_secretsmanager_secret.redis_url.arn,
        aws_secretsmanager_secret.nextauth_secret.arn,
        aws_secretsmanager_secret.cron_secret.arn
      ]
    }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "lumigift-${var.env}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# ─── CloudWatch Logs ──────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/lumigift-${var.env}"
  retention_in_days = 30
  tags              = local.tags
}

# ─── Deployment — CodeDeploy (Blue/Green) ────────────────────────────────────

resource "aws_codedeploy_app" "app" {
  compute_platform = "ECS"
  name             = "lumigift-${var.env}"
}

resource "aws_codedeploy_deployment_group" "app" {
  app_name               = aws_codedeploy_app.app.name
  deployment_config_name = "CodeDeployDefault.ECSAllAtOnce"
  deployment_group_name  = "lumigift-${var.env}"
  service_role_arn       = aws_iam_role.codedeploy.arn

  auto_rollback_configuration {
    enabled = true
    events  = ["DEPLOYMENT_FAILURE"]
  }

  blue_green_deployment_config {
    deployment_ready_option {
      action_on_timeout = "CONTINUE_DEPLOYMENT"
    }

    terminate_blue_instances_on_deployment_success {
      action                           = "TERMINATE"
      termination_wait_time_in_minutes = 5
    }
  }

  deployment_style {
    deployment_option = "WITH_TRAFFIC_CONTROL"
    deployment_type   = "BLUE_GREEN"
  }

  ecs_service {
    cluster_name = aws_ecs_cluster.main.name
    service_name = aws_ecs_service.app.name
  }

  load_balancer_info {
    target_group_pair_info {
      prod_traffic_route {
        listener_arns = [aws_alb_listener.http.arn]
      }

      target_group {
        name = aws_alb_target_group.blue.name
      }

      target_group {
        name = aws_alb_target_group.green.name
      }
    }
  }
}

resource "aws_iam_role" "codedeploy" {
  name = "lumigift-${var.env}-codedeploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "codedeploy.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "codedeploy" {
  role       = aws_iam_role.codedeploy.name
  policy_arn = "arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS"
}

# ─── DNS (Route 53) ───────────────────────────────────────────────────────────

data "aws_route53_zone" "main" {
  name = var.domain_name
}

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.env == "prod" ? var.domain_name : "${var.env}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_alb.main.dns_name
    zone_id                = aws_alb.main.zone_id
    evaluate_target_health = true
  }
}

# ─── Secrets (AWS Secrets Manager) ───────────────────────────────────────────
# Secrets are created empty; values are set out-of-band via the AWS console
# or CI pipeline — never stored in Terraform state as plaintext.

resource "aws_secretsmanager_secret" "db_url" {
  name = "lumigift/${var.env}/DATABASE_URL"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "redis_url" {
  name = "lumigift/${var.env}/REDIS_URL"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "nextauth_secret" {
  name = "lumigift/${var.env}/NEXTAUTH_SECRET"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "cron_secret" {
  name = "lumigift/${var.env}/CRON_SECRET"
  tags = local.tags
}

# ─── Security Groups ──────────────────────────────────────────────────────────

resource "aws_security_group" "db" {
  name   = "lumigift-${var.env}-db"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = local.tags
}

resource "aws_security_group" "redis" {
  name   = "lumigift-${var.env}-redis"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = local.tags
}

resource "aws_security_group" "alb" {
  name   = "lumigift-${var.env}-alb"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_security_group" "app" {
  name   = "lumigift-${var.env}-app"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

# ─── Locals ───────────────────────────────────────────────────────────────────

locals {
  tags = {
    Project     = "lumigift"
    Environment = var.env
    ManagedBy   = "terraform"
  }
}
