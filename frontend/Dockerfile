# Runs the React app with the Vite dev server on port 3000.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
# --host makes Vite listen outside the container, so http://localhost:3000 works
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
