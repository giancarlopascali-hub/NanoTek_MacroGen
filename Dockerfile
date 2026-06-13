# Build Stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage with Nginx
FROM nginx:alpine

# Copy custom Nginx configuration to run on port 7860
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts to Nginx public HTML directory
COPY --from=build /app/dist /usr/share/nginx/html

# Support Hugging Face Spaces non-root user (uid 1000)
RUN touch /var/run/nginx.pid && \
    chown -R 1000:0 /var/cache/nginx /var/run/nginx.pid /usr/share/nginx/html && \
    chmod -R g+w /var/cache/nginx /var/run/nginx.pid /usr/share/nginx/html

USER 1000

EXPOSE 7860

CMD ["nginx", "-g", "daemon off;"]
