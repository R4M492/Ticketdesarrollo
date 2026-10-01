FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/identity-service/package.json services/identity-service/package.json
RUN npm install --workspace=@helpdesk/identity-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/identity-service services/identity-service
WORKDIR /app/services/identity-service

EXPOSE 4001
CMD ["npm", "run", "dev"]
