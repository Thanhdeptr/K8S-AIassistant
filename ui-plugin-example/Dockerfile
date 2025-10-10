FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN yarn install

# Copy source code
COPY . .

# Expose port
EXPOSE 8005

# Set environment variable
ENV API=https://192.168.10.18:8443

# Start development server
CMD ["npm", "run", "dev"]
