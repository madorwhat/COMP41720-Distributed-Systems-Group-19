# Image for the auth service.
FROM node:22-slim
WORKDIR /app
COPY package.json ./
# package-lock.json isn't in the repo, so use npm install (npm ci needs the lock file).
RUN npm install --omit=dev
COPY . .
EXPOSE 4000
# `npm start` first creates/updates the tables and adds the team's admins, then runs the server.
# It runs as root so it can write the token keys into the shared keys/ folder the first time.
CMD ["npm", "start"]
