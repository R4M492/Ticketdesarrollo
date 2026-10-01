FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/settings-service/package.json services/settings-service/package.json
RUN npm install --workspace=@helpdesk/settings-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/settings-service services/settings-service
WORKDIR /app/services/settings-service

EXPOSE 4009
CMD ["npm", "run", "dev"]
