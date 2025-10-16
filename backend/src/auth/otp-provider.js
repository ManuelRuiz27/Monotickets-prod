import { EventEmitter } from 'node:events';

const events = new EventEmitter();

export async function deliverOtp({ curp, otp, channel = 'mock', env = process.env, logger }) {
  const payload = { level: 'info', message: 'otp_dispatched', curp, otp, channel };
  if (logger) {
    logger(payload);
  } else {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }
  events.emit('otp:sent', { curp, otp, channel, env });
}

export function getOtpEvents() {
  return events;
}

export const internals = { events };
