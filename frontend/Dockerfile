# Stage 1: Build
FROM node:18-alpine as builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Собираем проект в папку dist
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Копируем собранные файлы из этапа builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем конфиг nginx (создай его рядом с Dockerfile)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]