FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/organization-service/package.json services/organization-service/package.json
RUN npm install --workspace=@helpdesk/organization-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/organization-service services/organization-service
WORKDIR /app/services/organization-service

EXPOSE 4002
CMD ["npm", "run", "dev"]
