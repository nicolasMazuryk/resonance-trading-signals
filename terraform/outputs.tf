output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.trading_bots_cluster.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.trading_bots_cluster.arn
}

# output "service_arns" {
#   description = "Map of service names to their IDs"
#   value = {
#     resonance_reverse_signal_bot = aws_ecs_service.services["resonance_reverse_signal_bot"].id
#   }
# }

# output "task_definition_arns" {
#   description = "Map of task definition ARNs"
#   value = {
#     resonance_reverse_signal_bot = aws_ecs_task_definition.task_definitions["resonance_reverse_signal_bot"].arn
#   }
# }

# output "log_groups" {
#   description = "Map of CloudWatch log groups for each bot"
#   value = {
#     resonance_reverse_signal_bot = aws_cloudwatch_log_group.log_groups["resonance_reverse_signal_bot"].name
#   }
# }

# output "ecr_repository_urls" {
#   description = "Map of ECR repository URLs"
#   value = {
#     resonance_reverse_signal_bot = aws_ecr_repository.repositories["resonance_reverse_signal_bot"].repository_url
#   }
# }