import { APIRequestContext, expect } from '@playwright/test';
import { getBackendBaseURL, getWebhookURL } from './env';
import { deliveryRoutes } from './datasets';

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export async function postJSON<T>(
  request: APIRequestContext,
  path: string,
  payload: unknown,
) {
  const response = await request.post(buildUrl(path), {
    data: payload,
    headers: { 'content-type': 'application/json' },
  });
  return response;
}

export async function getJSON<T>(request: APIRequestContext, path: string) {
  const response = await request.get(buildUrl(path), {
    headers: { accept: 'application/json' },
  });
  return response;
}

export async function pollForResource(
  request: APIRequestContext,
  path: string,
  predicate: (body: any) => boolean,
  { timeoutMs = 15_000, intervalMs = 1_000 }: PollOptions = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastBody: any;
  while (Date.now() < deadline) {
    const response = await getJSON(request, path);
    if (!response.ok()) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }
    const body = await response.json();
    lastBody = body;
    if (predicate(body)) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  expect(lastBody, `Timed out while polling ${path}`).toBeTruthy();
  return lastBody;
}

export async function waitForWebhookReceipt(
  request: APIRequestContext,
  messageId: string,
  options?: PollOptions,
) {
  const probePath = `${deliveryRoutes.webhookProbe}?messageId=${encodeURIComponent(messageId)}`;
  return pollForResource(
    request,
    probePath,
    (body) => Array.isArray(body?.events) && body.events.some((event: any) => event.messageId === messageId),
    options,
  );
}

export function buildUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${getBackendBaseURL()}${path}`;
}

export async function fireWebhookAck(payload: Record<string, unknown>) {
  const response = await fetch(getWebhookURL(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  expect(response.ok, `Webhook responded with ${response.status}`).toBeTruthy();
  return response;
}
