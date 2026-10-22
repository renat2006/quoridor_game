FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js telemetry.js ./
COPY public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
# статистика (SQLite) — смонтируйте том, чтобы она пережила пересоздание контейнера
VOLUME /app/data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
