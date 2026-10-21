FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends iputils-ping && rm -rf /var/lib/apt/lists/* \
 && npm install -g genieacs@1.2.16 && npm cache clean --force \
 && useradd -r -m genieacs && mkdir -p /opt/genieacs/ext && chown genieacs /opt/genieacs/ext
USER genieacs
WORKDIR /opt/genieacs
