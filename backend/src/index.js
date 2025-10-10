import { createServer, ensureDependencies, log } from './server.js';

const PORT = Number(process.env.PORT || 8080);
const APP_ENV = process.env.APP_ENV || 'development';

const server = createServer({ env: process.env });

ensureDependencies({ env: process.env })
  .then(() => {
    server.listen(PORT, () => {
      log({ level: 'info', message: 'backend_api_started', port: PORT, env: APP_ENV });
    });
  })
  .catch((error) => {
    log({ level: 'fatal', message: 'startup_failed', error: error.message });
    process.exit(1);
  });
