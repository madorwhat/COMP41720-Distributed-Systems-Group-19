FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4003
# exec hands the process over to node, so `docker compose stop` reaches our shutdown code
# instead of stopping at npm.
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && exec node src/server.js"]
