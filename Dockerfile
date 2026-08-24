FROM node:20-alpine

WORKDIR /app

# git is required at runtime: the pipeline syncs game_backend/game-frontend
# to origin/dev and pushes generated game branches from inside this container.
RUN apk add --no-cache git

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
