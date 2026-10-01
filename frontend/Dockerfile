FROM node:20-alpine
WORKDIR /app

# Monorepo: se copian los manifiestos de todo el workspace para que npm resuelva
# las dependencias igual que en desarrollo local.
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm install --workspace=frontend --include-workspace-root

COPY frontend frontend
WORKDIR /app/frontend

EXPOSE 5173
CMD ["npm", "run", "dev"]
