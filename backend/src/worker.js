import net from 'node:net';
import { randomUUID } from 'node:crypto';

const redisUrl = new URL(process.env.REDIS_URL || 'redis://redis:6379');
const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);

function log(payload) {
  console.log(JSON.stringify({ request_id: randomUUID(), ...payload }));
}

async function pingRedis() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: redisUrl.hostname, port: Number(redisUrl.port || 6379) }, () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });

    socket.once('data', (chunk) => {
      const response = chunk.toString('utf8').trim();
      socket.end();
      if (response.startsWith('+PONG')) {
        resolve();
      } else {
        reject(new Error(`Unexpected Redis response: ${response}`));
      }
    });

    socket.on('error', (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

async function run() {
  log({ level: 'info', message: 'worker_started', redis: redisUrl.toString() });
  setInterval(async () => {
    try {
      await pingRedis();
      log({ level: 'info', message: 'worker_heartbeat' });
    } catch (error) {
      log({ level: 'error', message: 'worker_error', error: error.message });
    }
  }, intervalMs);
}

run().catch((error) => {
  log({ level: 'fatal', message: 'worker_failed', error: error.message });
  process.exit(1);
});
