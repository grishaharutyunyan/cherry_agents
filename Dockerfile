FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and documentation
COPY . .

# Compile TypeScript
RUN npm run build

EXPOSE 8888

# Default command: Runs the HTTP Microservice on Contabo VPS
CMD ["npm", "run", "start:prod"]
