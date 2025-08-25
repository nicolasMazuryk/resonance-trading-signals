# Infrastructure Setup for Resonance Signals

This document explains how to set up and deploy the infrastructure for the Telegram Signals Executor project on AWS.

## Overview

The infrastructure consists of:
- **ECS Fargate**: Runs the Telegram Signals Executor container
- **ECR**: Stores Docker images
- **CloudWatch**: Logging and monitoring
- **SNS + Lambda**: Slack notifications for errors and resource utilization

## Prerequisites

1. **AWS CLI** installed and configured
2. **Terraform** installed (version ~> 1.10.3)
3. **Docker** installed
4. **Node.js** and **npm** installed

## Setup Steps

### 2. Deploy Infrastructure

Deploy the AWS infrastructure using Terraform:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

This will create:
- ECS cluster
- ECR repositories
- CloudWatch log groups
- IAM roles and policies
- Security groups
- SNS topics and Lambda functions

### 3. Build and Deploy Application

Build the TypeScript project and deploy the Docker image:

```bash
# Build the project
npm run build

# Deploy to ECR
./docker/deploy.sh
```

### 4. Start the Service

The ECS service will automatically start after deployment. You can monitor it in the AWS Console or using:

```bash
# Check service status
aws ecs describe-services \
  --cluster resonance-signals-cluster \
  --services telegram_signals_executor-service

# View logs
aws logs tail /ecs/telegram_signals_executor --follow
```

## Configuration

### Resource Allocation

The ECS task is configured with:
- **CPU**: 512 units (0.5 vCPU)
- **Memory**: 1024 MB (1 GB)

## Monitoring and Logging

### CloudWatch Logs

Logs are automatically sent to CloudWatch with 7-day retention:
- Log Group: `/ecs/telegram_signals_executor`
- Stream Prefix: `ecs`

### Alarms

CloudWatch alarms are configured for:
- **CPU Utilization**: Alerts when > 80% for 2 consecutive periods
- **Memory Utilization**: Alerts when > 80% for 2 consecutive periods

### Error Notifications

Errors are automatically sent to Slack via:
1. CloudWatch Logs → Lambda → Slack (for ERROR level logs)
2. CloudWatch Alarms → SNS → Lambda → Slack (for resource utilization)

## Security

### IAM Roles

- **Execution Role**: Allows ECS to pull images and write logs
- **Task Role**: Allows the application to read SSM parameters

### Security Group

- **Inbound**: No inbound traffic allowed
- **Outbound**: All outbound traffic allowed (for API calls to exchanges and Telegram)

### Secrets Management

All sensitive data is stored in AWS SSM Parameter Store as SecureString parameters, encrypted at rest.

## Troubleshooting

### Common Issues

1. **Service won't start**: Check CloudWatch logs for startup errors
3. **Network issues**: Check security group configuration

### Useful Commands

```bash
# Check service status
aws ecs describe-services --cluster resonance-signals-cluster --services telegram_signals_executor-service

# View recent logs
aws logs tail /ecs/telegram_signals_executor --since 1h

# Check task status
aws ecs list-tasks --cluster resonance-signals-cluster --service-name telegram_signals_executor-service

# Describe task
aws ecs describe-tasks --cluster resonance-signals-cluster --tasks <task-arn>
```

## Cost Optimization

- **Fargate**: Pay only for resources used
- **Log Retention**: 7-day retention to minimize storage costs
- **ARM64**: More cost-effective than x86_64
- **Spot Instances**: Consider using Fargate Spot for non-critical workloads

## Cleanup

To destroy the infrastructure:

```bash
cd terraform
terraform destroy
```

**Warning**: This will delete all resources including logs and data. Make sure to backup any important data first.
