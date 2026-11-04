FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public
ENV HOST=0.0.0.0 PORT=8000 DATA_DIR=/data
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8000/api/health || exit 1
CMD ["node", "server.js"]
