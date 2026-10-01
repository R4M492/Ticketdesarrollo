FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/attachment-service/package.json services/attachment-service/package.json
RUN npm install --workspace=@helpdesk/attachment-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/attachment-service services/attachment-service
WORKDIR /app/services/attachment-service

EXPOSE 4005
CMD ["npm", "run", "dev"]
