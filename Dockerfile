FROM node:22-bookworm-slim

WORKDIR /app

RUN chown node:node /app

USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node vendor ./vendor
RUN npm ci
RUN mkdir node_modules/.package-snapshots && \
    cp package.json package-lock.json node_modules/.package-snapshots

COPY --chown=node:node . .
COPY --chown=node:node docker/entrypoint.sh /usr/local/lib/mission-control-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["sh", "/usr/local/lib/mission-control-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
