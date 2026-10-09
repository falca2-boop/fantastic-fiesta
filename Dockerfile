FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
ENV HOST=0.0.0.0 PORT=8000 DATA_DIR=/data
VOLUME /data
EXPOSE 8000
CMD ["node", "server.js"]
