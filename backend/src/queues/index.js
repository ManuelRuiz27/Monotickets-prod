import { createLogger } from '../logging.js';
import { createSimpleQueue } from './simple-queue.js';

const DEFAULT_BACKOFF_DELAY = 5000;
const DEFAULT_ATTEMPTS = 5;

export async function createQueues(options = {}) {
  const { env = process.env } = options;
  const logger = options.logger || createLogger({ env, service: env.SERVICE_NAME || 'backend-api' });
  const connectionOptions = { env, logger };
  const defaultJobOptions = {
    attempts: Number(env.QUEUE_DEFAULT_ATTEMPTS || DEFAULT_ATTEMPTS),
    backoff: { type: 'exponential', delay: Number(env.QUEUE_BACKOFF_DELAY_MS || DEFAULT_BACKOFF_DELAY) },
    removeOnComplete: true,
    removeOnFail: false,
  };

  const whatsappQueueName =
    env.WHATSAPP_QUEUE_NAME || env.WA_OUTBOUND_QUEUE_NAME || env.DELIVERY_QUEUE_NAME || 'queue:whatsapp';
  const emailQueueName = env.EMAIL_QUEUE_NAME || 'queue:email';
  const pdfQueueName = env.PDF_QUEUE_NAME || 'queue:pdf';
  const inboundQueueName = env.WA_INBOUND_QUEUE_NAME || 'wa_inbound';
  const failedQueueName = env.DELIVERY_FAILED_QUEUE_NAME || 'queue:delivery:failed';

  const whatsapp = await createSimpleQueue(whatsappQueueName, {
    logger,
    connectionOptions,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: Math.max(Number(env.DELIVERY_MAX_RETRIES || 5), 5),
      backoff: buildDeliveryBackoff(env),
    },
  });

  const email = await createSimpleQueue(emailQueueName, {
    logger,
    connectionOptions,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: Number(env.EMAIL_MAX_RETRIES || 3),
    },
  });

  const pdf = await createSimpleQueue(pdfQueueName, {
    logger,
    connectionOptions,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: Number(env.PDF_MAX_RETRIES || 3),
    },
  });

  const waInbound = await createSimpleQueue(inboundQueueName, {
    logger,
    connectionOptions,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: Math.max(Number(env.DELIVERY_MAX_RETRIES || 5), 5),
      backoff: buildDeliveryBackoff(env),
    },
  });

  const payments = await createSimpleQueue(env.PAYMENTS_QUEUE_NAME || 'paymentsQueue', {
    logger,
    connectionOptions,
    defaultJobOptions,
  });

  const deliveryFailed = await createSimpleQueue(failedQueueName, {
    logger,
    connectionOptions,
    defaultJobOptions,
  });

  return {
    whatsappQueue: whatsapp.queue,
    whatsappEvents: whatsapp.events,
    emailQueue: email.queue,
    emailEvents: email.events,
    pdfQueue: pdf.queue,
    pdfEvents: pdf.events,
    deliveryFailedQueue: deliveryFailed.queue,
    deliveryFailedEvents: deliveryFailed.events,
    deliveryQueue: whatsapp.queue,
    deliveryEvents: whatsapp.events,
    waOutboundQueue: whatsapp.queue,
    waOutboundEvents: whatsapp.events,
    waInboundQueue: waInbound.queue,
    waInboundEvents: waInbound.events,
    paymentsQueue: payments.queue,
    paymentsEvents: payments.events,
  };
}

function buildDeliveryBackoff(env = process.env) {
  const raw = String(env.DELIVERY_BACKOFF_SEQUENCE_MS || '1000,5000,20000,60000');
  const delays = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (delays.length === 0) {
    return { type: 'exponential', delay: Number(env.QUEUE_BACKOFF_DELAY_MS || DEFAULT_BACKOFF_DELAY) };
  }
  return { type: 'sequence', delays };
}
