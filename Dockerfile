FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node *.mjs ./
COPY --chown=node:node server-data ./server-data
COPY --chown=node:node public ./public
ENV NODE_OPTIONS=--max-old-space-size=256
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
