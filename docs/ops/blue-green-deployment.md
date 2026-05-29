# Blue-Green Deployment Strategy

This document describes the blue-green deployment strategy implemented for Lumigift's production environment to ensure zero-downtime releases and instant rollback capabilities.

## Architecture

The infrastructure is built on AWS using:
- **Application Load Balancer (ALB)**: Routes production traffic to the active environment.
- **Amazon ECS (Fargate)**: Runs the application containers.
- **Target Groups**: Two target groups (`blue` and `green`) represent the two environments.
- **AWS CodeDeploy**: Manages the traffic shift between target groups.

## Deployment Workflow

1. **Build & Push**: The CI/CD pipeline builds a new Docker image and pushes it to Amazon ECR.
2. **Migrations**: Database migrations are executed *before* the application update. Migrations must be backward compatible.
3. **Provisioning**: ECS provisions new tasks (the "green" environment) using the new image.
4. **Health Checks**: CodeDeploy waits for the new tasks to pass ALB health checks.
5. **Traffic Shift**: CodeDeploy atomically switches the ALB listener from the old target group (blue) to the new target group (green).
6. **Baking Period**: The old environment remains active for a short period (5 minutes) to allow for instant rollback if issues are detected.
7. **Cleanup**: If the deployment is successful, the old tasks are terminated.

## Database Migration Strategy

To achieve zero-downtime, database migrations must not break the currently running version of the application.

### Recommended Patterns
- **Adding a column**: Safe.
- **Adding a table**: Safe.
- **Renaming a column**: 
    1. Add the new column.
    2. Update code to write to both columns.
    3. Backfill data from old to new.
    4. Update code to read from new column.
    5. Drop the old column in a subsequent release.
- **Dropping a column**: Only drop after the code no longer references it.

## Monitoring & Validation

After the traffic shift, the CI/CD pipeline runs smoke tests against the production URL.

If smoke tests fail, or if Sentry reports a spike in errors, an **instant rollback** should be triggered.

## Rollback Procedures

### Automatic Rollback
CodeDeploy is configured to automatically roll back if:
- Deployment fails to pass health checks.
- A CloudWatch Alarm (if configured) is triggered during the baking period.

### Manual Rollback
If a critical bug is discovered after a successful deployment:
1. Go to the **AWS CodeDeploy** console.
2. Select the `lumigift-prod` application.
3. Select the active deployment.
4. Click **Stop and Roll Back**.

Traffic will be switched back to the previous target group in < 60 seconds.

## Runbook for Deployment Failures

1. **ECS Task Placement Failure**: Check ECS service logs for capacity issues or container startup errors.
2. **Health Check Timeout**: Verify the `/api/health` endpoint is returning `200 OK` in the new version.
3. **CodeDeploy Timeout**: Check the CodeDeploy console for specific error messages during the traffic shift phase.
