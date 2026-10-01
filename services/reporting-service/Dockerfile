FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/reporting-service/package.json services/reporting-service/package.json
RUN npm install --workspace=@helpdesk/reporting-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/reporting-service services/reporting-service
WORKDIR /app/services/reporting-service

EXPOSE 4008
CMD ["npm", "run", "dev"]
