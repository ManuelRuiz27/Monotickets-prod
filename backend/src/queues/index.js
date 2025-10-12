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

  const outboundQueueName = env.WA_OUTBOUND_QUEUE_NAME || env.DELIVERY_QUEUE_NAME || 'wa_outbound';
  const inboundQueueName = env.WA_INBOUND_QUEUE_NAME || 'wa_inbound';
  const delivery = await createSimpleQueue(outboundQueueName, {
    logger,
    connectionOptions,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: Number(env.DELIVERY_MAX_RETRIES || defaultJobOptions.attempts),
    },
  });

  const waInbound = await createSimpleQueue(inboundQueueName, {
    logger,
    connectionOptions,
    defaultJobOptions,
  });

  const payments = await createSimpleQueue(env.PAYMENTS_QUEUE_NAME || 'paymentsQueue', {
    logger,
    connectionOptions,
    defaultJobOptions,
  });

  return {
    deliveryQueue: delivery.queue,
    deliveryEvents: delivery.events,
    waOutboundQueue: delivery.queue,
    waOutboundEvents: delivery.events,
    waInboundQueue: waInbound.queue,
    waInboundEvents: waInbound.events,
    paymentsQueue: payments.queue,
    paymentsEvents: payments.events,
  };
}
