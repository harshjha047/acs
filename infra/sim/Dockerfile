FROM node:24-alpine
RUN apk add --no-cache git \
 && git clone --depth 1 https://github.com/genieacs/genieacs-sim /sim \
 && cd /sim && npm install --omit=dev && npm cache clean --force
WORKDIR /sim
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
