# Servicio Delivery

El servicio Delivery centraliza los envíos de invitaciones y recordatorios vía WhatsApp o correo electrónico. Se expone desde el backend HTTP y delega el trabajo pesado a las colas basadas en Redis.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/deliver/send` | Crea envíos individuales o por lote. El cuerpo debe incluir `guestId` o `guestIds[]`, `eventId`, `channel` (`whatsapp`/`email`) y `template`. |
| `POST` | `/deliver/webhook` | Recibe webhooks de 360dialog. Responde `200 OK` inmediatamente y encola el payload para procesamiento asíncrono. |
| `GET` | `/deliver/:id/status` | Consulta el estado del envío usando el `id` de `delivery_logs` o el `provider_ref`. |

Los endpoints legados (`POST /events/:eventId/guests/:guestId/send`, `POST /wa/webhook`, `GET /wa/session/:phone`) siguen disponibles para compatibilidad.

## Colas y workers

- `wa_outbound` (configurable con `DELIVERY_QUEUE_NAME` o `WA_OUTBOUND_QUEUE_NAME`): recibe jobs `send` con los datos del invitado y del template. Implementa reintentos exponenciales y DLQ.
- `wa_inbound`: procesa los webhooks de 360dialog y actualiza sesiones de 24 h, así como estados de invitados confirmados.

Ambas colas usan backoff exponencial con máximos definidos en las variables de entorno `DELIVERY_MAX_RETRIES` y `QUEUE_BACKOFF_DELAY_MS`. Los jobs entran a DLQ cuando exceden los reintentos; se registran en logs para trazabilidad.

## Idempotencia y deduplicación

- **Outbound**: antes de encolar se calcula una clave `delivery:dedupe:{guestId}:{template}`. Si existe dentro de la ventana configurada (`DELIVERY_DEDUPE_WINDOW_MIN`, minutos), el job se marca como `duplicate` y no se vuelve a encolar. Esto evita envíos repetidos en menos de 24 h.
- **Inbound**: cada mensaje entrante de WhatsApp verifica `provider_ref` y `message.id`. Si ya fueron procesados se ignoran, evitando cambios de estado duplicados.

## delivery_logs

Todos los cambios de estado (queued, sent, delivered, failed) se guardan en `delivery_logs`. La tabla está particionada mensualmente y hash por `event_id` para mantener consultas rápidas. Las columnas clave son:

- `channel`, `template`, `status`.
- `provider_ref` (referencia del proveedor, usada para idempotencia y tracking).
- `error` (JSON con detalle del fallo, cuando aplica).

## Estado de invitados y regla de 24 h

Cuando se recibe un mensaje válido dentro de la ventana de 24 h (`WA_SESSION_TTL_SECONDS`) se registra la sesión en Redis (`wa:session:{phone}`). Si el cuerpo contiene afirmaciones de confirmación (por ejemplo `confirm`), se actualiza al invitado de `pending` → `confirmed` y se limpia la caché `landing:*`. Posteriormente, los jobs de envío pueden cambiar a `sent/delivered` y las vistas del dashboard reflejan el cambio.

## Variables de entorno relevantes

| Variable | Descripción |
| --- | --- |
| `WA_API_BASE` | Base URL del API de 360dialog. Se usa cuando hay credenciales reales. |
| `WA_API_TOKEN` | Token Bearer para 360dialog. Si falta, los envíos se simulan (`simulated=true`). |
| `RESEND_API_KEY` | API key de Resend para correos. |
| `DELIVERY_MAX_RETRIES` | Máximo de reintentos por job en `wa_outbound`. |
| `DELIVERY_DEDUPE_WINDOW_MIN` | Ventana (minutos) para evitar envíos duplicados. Predeterminado 24 h. |
| `REDIS_URL` | Conexión a Redis para colas, dedupe y locks. |

## Pruebas rápidas

```bash
# Envío outbound
curl -sS -X POST http://localhost:8080/deliver/send \
  -H "Content-Type: application/json" \
  -d '{"eventId":"ev_demo","guestId":"guest_demo","channel":"whatsapp","template":"invite"}'

# Webhook inbound (se encola y responde 200)
curl -sS -X POST http://localhost:8080/deliver/webhook \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"msg_123","from":"+5215550000000","text":"confirm"}]}'

# Consulta de estado
curl -sS http://localhost:8080/deliver/123/status
```

Todos los comandos deben responder `2xx` y generar entradas en `delivery_logs` con los estados correspondientes.
