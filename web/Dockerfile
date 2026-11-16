FROM node:24-alpine AS builder
WORKDIR /web
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /web
COPY --from=builder /web/build build/
COPY --from=builder /web/package*.json ./
RUN npm install --omit=dev
EXPOSE 3001
CMD ["node", "build"]
