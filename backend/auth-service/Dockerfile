# Debian-based (not alpine) so the sqlite3 prebuilt binary works without build tools.
FROM node:22-slim
WORKDIR /app

COPY package*.json ./
# Full install (not --omit=dev): sequelize-cli is needed to run migrations at startup.
RUN npm ci

COPY . .
EXPOSE 4000

# DECISION: runs as root so the bind-mounted keys/ are readable whatever their host owner is.
# Bake keys in via JWT_PRIVATE_KEY/JWT_PUBLIC_KEY env vars and add "USER node" for real deployments.
CMD ["sh", "-c", "npx sequelize-cli db:migrate && node src/server.js"]
