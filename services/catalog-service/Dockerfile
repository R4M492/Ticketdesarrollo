FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/catalog-service/package.json services/catalog-service/package.json
RUN npm install --workspace=@helpdesk/catalog-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/catalog-service services/catalog-service
WORKDIR /app/services/catalog-service

EXPOSE 4003
CMD ["npm", "run", "dev"]
