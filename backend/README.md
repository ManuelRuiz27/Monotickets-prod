# Monotickets Backend

Servicios HTTP + jobs responsables de autenticación básica, escaneo y ahora los flujos de Delivery (invitaciones/notificaciones) y Director (métricas financieras).

## Endpoints relevantes

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/events/:eventId/guests/:guestId/send` | Encola un envío de invitación/recordatorio (WhatsApp/Email). |
| `POST` | `/wa/webhook` | Recibe webhooks de 360dialog y los encola de forma asíncrona. |
| `GET` | `/wa/session/:phone` | Consulta la ventana de 24h de sesión de WhatsApp para un número. |
| `GET` | `/director/overview` | Obtiene métricas financieras y operativas desde vistas materializadas. |
| `POST` | `/director/payments` | Registra un pago manual confirmado y limpia la caché del panel. |
| `POST` | `/payments/intent` | Crea una intención de pago (`stripe`, `conekta` o `mock`). |
| `POST` | `/payments/webhook` | Acepta webhooks de pagos y los delega al worker. |

Todos los endpoints devuelven el `requestId` en la respuesta para facilitar el tracing.

## Colas y workers

- `deliveryQueue`: envíos salientes (WhatsApp/Resend). Reintento exponencial con DLQ.
- `waInboundQueue`: procesamiento de webhooks 360dialog.
- `paymentsQueue`: confirmaciones asíncronas de Stripe/Conekta.

Las colas se implementan sobre Redis siguiendo semántica BullMQ (reintentos, backoff y `removeOnComplete=true`). Si necesitas revisar el estado de las colas ejecuta el worker con `LOG_FORMAT=json` para inspeccionar `queue_metrics` periódicos.

## Jobs nocturnos

El worker corre `runLandingTtlJob` cada noche (`LANDING_JOB_HOUR`, `LANDING_JOB_MINUTE`). Usa `LANDING_TTL_DEFAULT_DAYS` (clamp 30–365) para decidir cuándo pasar un evento `active → archived → expired`. Flags:

- `node src/worker.js --dry-run`: solo reporta cambios.
- `node src/worker.js --force`: ignora el lock en Redis y fuerza una corrida (útil en QA).

El job invalida las cachés `landing:*` y `landing:dashboard:*` en Redis y mantiene un lock (`LANDING_TTL_LOCK_KEY`).

## Pagos

Configura `PAYMENTS_PROVIDER` + credenciales (`STRIPE_SECRET_KEY` o `CONEKTA_API_KEY`). Si no existen claves válidas el backend cae en modo `mock` y etiqueta los registros en logs (`payments_provider_mock_mode`).

Los registros se guardan en la tabla `payments` y alimentan las vistas materializadas que consume `/director/overview`.

## Scripts auxiliares

- `npm start`: levanta la API.
- `npm run start:worker`: inicia workers + métricas + job de TTL.
- `infra/refresh-kpis.sh`: ejecuta `REFRESH MATERIALIZED VIEW` (usa `psql`). Úsalo manualmente tras cargar datos masivos.

## Notas de desarrollo

1. Asegúrate de exportar las variables de entorno descritas en `docs/docker-env.md` o copiar `.env.example` → `.env`.
2. Levanta el stack recomendado:
   ```bash
   docker compose -f infra/docker-compose.yml up --build -d database redis backend-api workers
   ```
3. Smoke test rápido:
   ```bash
   curl -sS -X POST http://localhost:8080/events/ev_demo/guests/g1/send -H "Content-Type: application/json" -d '{"channel":"whatsapp"}'
   curl -sS -X POST http://localhost:8080/wa/webhook -H "Content-Type: application/json" -d '{}'
   curl -sS http://localhost:8080/wa/session/5215550000
   curl -sS http://localhost:8080/director/overview
   curl -sS -X POST http://localhost:8080/payments/intent -H "Content-Type: application/json" -d '{"amount":1000,"currency":"mxn"}'
   ```

Los comandos anteriores deben responder sin errores 5xx aun cuando falten credenciales (modo mock).
