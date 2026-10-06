# Queue on a server (Railway etc.). Runs the web app + scheduler 24/7.
# Data, videos and the saved Instagram login live on a volume mounted at /data.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY public ./public
ENV NODE_ENV=production HOSTED=1 DATA_DIR=/data
# QUEUE_PASSWORD must be set as a variable on the host — the app refuses to start without it.
CMD ["node", "bin/queue.js", "serve"]
