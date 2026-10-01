FROM node:20-alpine AS base
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias internas (@helpdesk/common) igual que en desarrollo.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/ticketing-service/package.json services/ticketing-service/package.json
RUN npm install --workspace=@helpdesk/ticketing-service --workspace=@helpdesk/common --include-workspace-root

COPY packages/common packages/common
COPY services/ticketing-service services/ticketing-service
WORKDIR /app/services/ticketing-service

EXPOSE 4004
CMD ["npm", "run", "dev"]
