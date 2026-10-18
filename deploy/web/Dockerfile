# Voidcat Cloud's web app on Cloud Run: the built interface (`bun run build` → dist/) served by nginx as a non-root
# user on port 8080. Everything the browser gets is static; the library is opened and unlocked in the browser itself.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY headers.conf /etc/nginx/voidcat-headers.conf
COPY dist /usr/share/nginx/html
EXPOSE 8080
