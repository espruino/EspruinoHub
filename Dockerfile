ARG NODE_VERSION=16

FROM node:${NODE_VERSION}-alpine AS build

COPY / /app

RUN set -x \
  && apk add --no-cache --virtual .build-deps \
    build-base \
    linux-headers \
    eudev-dev \
    python3 \
    git \
  && cd /app \
  && npm i --production --verbose \
  && apk del .build-deps

FROM node:${NODE_VERSION}-alpine

COPY --from=build /app /app

RUN set -x \
  && apk add --no-cache tzdata libcap \
  && mkdir -p /data \
  && cp /app/config.json /data/config.json \
  # support port 80/443
  && setcap 'cap_net_bind_service=+ep' `which node`

WORKDIR /app

CMD [ "node", "index.js", "-c", "/data/config.json" ]
