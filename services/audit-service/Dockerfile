FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/audit-service/package.json services/audit-service/package.json
RUN npm install --workspace=@helpdesk/audit-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/audit-service services/audit-service
WORKDIR /app/services/audit-service

EXPOSE 4007
CMD ["npm", "run", "dev"]
