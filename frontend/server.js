import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.FRONTEND_PORT || 3000);

const routes = {
  '/': homepage,
  '/staff': staffpage,
};

const server = http.createServer((req, res) => {
  const requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('x-request-id', requestId);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handler = routes[url.pathname];
  if (handler) {
    const body = handler();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    log({ level: 'info', message: 'frontend_request', path: url.pathname, request_id: requestId });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    log({ level: 'warn', message: 'frontend_not_found', path: url.pathname, request_id: requestId });
  }
});

server.listen(PORT, () => {
  log({ level: 'info', message: 'frontend_started', port: PORT, request_id: randomUUID() });
});

function homepage() {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Monotickets PWA</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: system-ui, sans-serif; margin: 2rem; }
        a { color: #2563eb; }
      </style>
    </head>
    <body>
      <h1>Monotickets Platform</h1>
      <p>Placeholder progressive web app for guests and organizers.</p>
      <p><a href="/staff">Staff portal</a></p>
    </body>
  </html>`;
}

function staffpage() {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Monotickets Staff Portal</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: system-ui, sans-serif; margin: 2rem; }
      </style>
    </head>
    <body>
      <h1>Staff Check-in</h1>
      <p>Placeholder interface for staff workflows.</p>
    </body>
  </html>`;
}

function log(payload) {
  console.log(JSON.stringify(payload));
}
