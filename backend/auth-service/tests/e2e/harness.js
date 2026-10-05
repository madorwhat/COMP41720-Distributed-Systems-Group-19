// Starts the REAL auth service as a separate process (real migrations, real CLI, real HTTP)
// so the e2e tests exercise it exactly as the frontend and booking service will.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SERVICE_KEY = 'e2e-service-key-0123456789';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () =>
  new Promise((resolve) => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

// Stand-in for the Python notification service: records every email it is asked to send.
async function startFakeNotifier() {
  const sent = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      sent.push({ path: req.url, ...JSON.parse(body) });
      res.writeHead(202).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    sent,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Uses a throwaway SQLite file, or Postgres when E2E_DATABASE_URL is set (use an empty database).
async function startAuthService({ notifierUrl }) {
  const port = await freePort();
  const sqliteFile = path.join(os.tmpdir(), `auth-e2e-${process.pid}.sqlite`);
  const db = process.env.E2E_DATABASE_URL
    ? { DB_DIALECT: 'postgres', DATABASE_URL: process.env.E2E_DATABASE_URL }
    : { DB_DIALECT: 'sqlite', DB_STORAGE: sqliteFile };
  const env = {
    ...process.env, // includes the throwaway JWT key pair from tests/env.js
    ...db,
    NODE_ENV: 'development', // plain-http cookies, like a local frontend
    PORT: String(port),
    INTERNAL_SERVICE_KEY: SERVICE_KEY,
    NOTIFICATION_SERVICE_URL: notifierUrl,
    CORS_ORIGINS: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:3000',
  };

  execSync('npx sequelize-cli db:migrate', { cwd: ROOT, env, stdio: 'pipe' });
  // The team seed provides the one system admin (sysadmin@example.com).
  execSync('npx sequelize-cli db:seed:all', { cwd: ROOT, env, stdio: 'pipe' });

  const child = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) break;
    } catch {
      // not listening yet
    }
    if (attempt > 50) throw new Error(`Auth service did not start:\n${output}`);
    await sleep(200);
  }

  return {
    baseUrl,
    output: () => output,
    stop: async () => {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
      fs.rmSync(sqliteFile, { force: true });
    },
  };
}

// Behaves like one browser tab: remembers its access token (in memory) and refresh cookie.
function createClient(baseUrl) {
  const client = { accessToken: null, cookie: null };

  client.call = async (method, url, { body, headers = {}, bearer = true } = {}) => {
    const h = { ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (bearer && client.accessToken) h.Authorization = `Bearer ${client.accessToken}`;
    if (client.cookie) h.Cookie = client.cookie;

    const res = await fetch(baseUrl + url, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('refresh_token='));
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      client.cookie = pair === 'refresh_token=' ? null : pair; // empty value = cookie cleared
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (json?.accessToken) client.accessToken = json.accessToken;
    return { status: res.status, body: json, headers: res.headers, setCookie };
  };

  return client;
}

module.exports = { SERVICE_KEY, startFakeNotifier, startAuthService, createClient };
