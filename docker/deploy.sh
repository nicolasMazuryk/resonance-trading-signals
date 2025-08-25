#!/bin/bash

aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com

# Bot names to be build and pushed to ECR
BOTS=("resonance_reverse_signal_bot")

for BOT in "${BOTS[@]}"; do
    echo "Building and pushing $BOT..."
    
    docker build -f "./docker/Dockerfile.$BOT" -t "${AWS_ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com/$BOT:latest" .
    
    docker push "${AWS_ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com/$BOT:latest"
done

echo "All images have been pushed to ECR successfully!"