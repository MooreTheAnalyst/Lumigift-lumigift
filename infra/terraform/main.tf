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

# ─── Compute — App Runner (serverless Next.js) ────────────────────────────────

resource "aws_apprunner_service" "app" {
  service_name = "lumigift-${var.env}"

  source_configuration {
    image_repository {
      image_identifier      = var.app_image
      image_repository_type = "ECR"
      image_configuration {
        port = "3000"
        runtime_environment_secrets = {
          DATABASE_URL      = aws_secretsmanager_secret.db_url.arn
          REDIS_URL         = aws_secretsmanager_secret.redis_url.arn
          NEXTAUTH_SECRET   = aws_secretsmanager_secret.nextauth_secret.arn
          CRON_SECRET       = aws_secretsmanager_secret.cron_secret.arn
        }
      }
    }
    auto_deployments_enabled = true
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
  }

  tags = local.tags
}

# ─── DNS (Route 53) ───────────────────────────────────────────────────────────

data "aws_route53_zone" "main" {
  name = var.domain_name
}

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.env == "prod" ? var.domain_name : "${var.env}.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_apprunner_service.app.service_url]
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

resource "aws_security_group" "app" {
  name   = "lumigift-${var.env}-app"
  vpc_id = var.vpc_id

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
