FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/notification-service/package.json services/notification-service/package.json
RUN npm install --workspace=@helpdesk/notification-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/notification-service services/notification-service
WORKDIR /app/services/notification-service

EXPOSE 4006
CMD ["npm", "run", "dev"]
