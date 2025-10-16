import packageJson from '../../package.json' with { type: 'json' };

let sentryClient = null;
let initializing = false;

function resolveEnvironment(env = process.env) {
  return String(env.APP_ENV || env.NODE_ENV || 'development');
}

export function initializeSentry({ env = process.env, logger }) {
  const dsn = env.SENTRY_DSN;
  if (!dsn || typeof dsn !== 'string' || !dsn.trim()) {
    return { captureException: () => {} };
  }

  if (!initializing && !sentryClient) {
    initializing = true;
    const load = async () => {
      try {
        const sentryModule = await import('@sentry/node');
        sentryModule.init({
          dsn,
          environment: resolveEnvironment(env),
          release: env.SENTRY_RELEASE || packageJson.version || '0.0.0',
          tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE || 0),
          sampleRate: Number(env.SENTRY_SAMPLE_RATE || 1),
        });
        sentryClient = sentryModule;
        setupGlobalHandlers(sentryModule, logger);
      } catch (error) {
        sentryClient = null;
        if (logger) {
          logger({ level: 'warn', message: 'sentry_init_failed', error: error?.message });
        }
      }
    };
    load().finally(() => {
      initializing = false;
    });
  }

  return {
    captureException(error, context = {}) {
      if (sentryClient?.captureException) {
        sentryClient.captureException(error, context);
      }
    },
  };
}

function setupGlobalHandlers(client, logger) {
  const handler = (error, origin) => {
    try {
      client.captureException(error, { tags: { origin: origin || 'unknown' } });
    } catch (captureError) {
      if (logger) {
        logger({ level: 'error', message: 'sentry_capture_failed', error: captureError?.message });
      }
    }
  };

  if (!process.listeners('unhandledRejection').some((fn) => fn.name === 'sentryUnhandledRejectionHandler')) {
    const wrapped = function sentryUnhandledRejectionHandler(reason) {
      handler(reason, 'unhandledRejection');
    };
    process.on('unhandledRejection', wrapped);
  }

  if (!process.listeners('uncaughtException').some((fn) => fn.name === 'sentryUncaughtExceptionHandler')) {
    const wrapped = function sentryUncaughtExceptionHandler(error) {
      handler(error, 'uncaughtException');
    };
    process.on('uncaughtException', wrapped);
  }
}
