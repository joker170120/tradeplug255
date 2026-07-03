FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3080

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/storage/data /app/storage/uploads

VOLUME ["/app/storage"]
EXPOSE 3080

CMD ["npm", "start"]
