FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY pages ./pages

EXPOSE 8055
CMD ["node", "pages/server.js"]


