export async function runMiddlewareStack(middlewares = [], req, res, context = {}) {
  for (const middleware of middlewares) {
    if (typeof middleware !== 'function') {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await middleware(req, res, context);
    if (result === false || context.terminated || res.writableEnded) {
      return { halted: true };
    }
  }

  return { halted: false };
}
