import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const envFile = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: false });
} else {
  dotenv.config({ override: false });
}

const fallback = {
  backend: 'http://backend:3000',
  frontend: 'http://frontend:3001',
  webhook: 'http://backend:3000/wa/webhook',
};

export function getBackendBaseURL(): string {
  return process.env.BASE_URL_BACKEND || fallback.backend;
}

export function getFrontendBaseURL(): string {
  return process.env.BASE_URL_FRONTEND || fallback.frontend;
}

export function getWebhookURL(): string {
  return process.env.WA_WEBHOOK_URL || fallback.webhook;
}

export function isCIEnvironment(): boolean {
  return (process.env.CI || '1') !== '0';
}

export function getNumberFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
