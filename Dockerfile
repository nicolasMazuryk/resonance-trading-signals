FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create data and logs directories
RUN mkdir -p data logs

# No port exposure needed (no server)

# Start the application
CMD ["npm", "start"]
