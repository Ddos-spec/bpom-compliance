FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY server_db.mjs ./
COPY public ./public
COPY data ./data
ENV PORT=4173
ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "server.mjs"]
