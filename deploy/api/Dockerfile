# voidcat-api on Cloud Run: Bun running api/server.ts as a non-root user on port 8080.
FROM oven/bun:1.3.14-slim
WORKDIR /app
COPY api/package.json api/bun.lock ./api/
RUN cd api && bun install --frozen-lockfile --production
COPY api/server.ts api/read.ts ./api/
COPY src/lib/filing.ts ./src/lib/filing.ts
USER bun
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["bun", "api/server.ts"]
