# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Build-time env var (CRA bakes it in during npm run build)
ARG REACT_APP_API_URL=http://localhost:4000
ENV REACT_APP_API_URL=$REACT_APP_API_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
