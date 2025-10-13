# Servicio Director

El servicio Director expone los flujos financieros de Monotickets para administrar tickets asignados a organizadores, registrar pagos y consultar métricas agregadas.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/director/assign` | Registra una asignación de tickets prepago o préstamo. Requiere `organizerId`, `eventId`, `type` (`prepaid`/`loan`), `tickets` y `price`. |
| `GET` | `/director/organizers/:id/ledger` | Devuelve el historial de movimientos del organizador, incluyendo totales y saldo. |
| `POST` | `/director/payments` | Registra un pago recibido y descuenta la deuda abierta del organizador. |
| `GET` | `/director/reports/overview` | Métricas globales (tickets equivalentes, deuda, pagos) con filtros `from`, `to`, `status`, `organizerId`, `eventId`. |
| `GET` | `/director/reports/top-organizers` | Ranking de organizadores por tickets equivalentes. Soporta filtros estándar y paginación `page`, `pageSize`, `sort`, `dir`, `limit`. |
| `GET` | `/director/reports/debt-aging` | Distribución de deuda por tramos (`0–30`, `31–60`, `61–90`, `>90` días). |
| `GET` | `/director/reports/tickets-usage` | Uso de tickets por evento (`standard`/`premium`). Acepta `eventType`, `organizerId`, `from`, `to` y paginación. |

El endpoint heredado `/director/overview` sigue disponible y ahora consulta las vistas materializadas descritas abajo.

## Modelo de tickets equivalentes

Cada evento define su tipo (`standard` o `premium`). El factor de conversión se controla con `TICKET_PREMIUM_FACTOR` (por defecto 2). Se calcula:

```
tickets_equivalentes = tickets_asignados * (event.type === 'premium' ? TICKET_PREMIUM_FACTOR : 1)
```

Los movimientos almacenan tanto los tickets sin conversión como los equivalentes para facilitar los KPIs.

## Ledger y movimientos

Las asignaciones y pagos se guardan en `director_ledger_entries`.

- `entry_type`: `assign_prepaid`, `assign_loan` o `payment`.
- `tickets` y `tickets_equivalent` para medir inventario.
- `amount_cents` y `currency` para calcular deuda y pagos.
- `metadata` con detalles extra (ej. plantilla, notas).

El ledger se puede consultar por organizador con paginación simple (ordenado por `created_at` descendente). El servicio calcula, en tiempo real, el saldo pendiente como:

```
deuda = sum(asignaciones.amount_cents) - sum(pagos.amount_cents)
```

## KPIs y vistas materializadas

Se crearon las siguientes vistas:

- `mv_kpi_tickets_entregados`: total de tickets equivalentes entregados por organizador y evento.
- `mv_kpi_deuda_abierta`: deuda pendiente (`amount_cents`) por organizador.
- `mv_kpi_top_organizadores`: ranking de organizadores por tickets equivalentes entregados.

El script `docs/db/migrations/refresh_kpis.sql` ejecuta `REFRESH MATERIALIZED VIEW CONCURRENTLY` para las tres vistas. Se recomienda correrlo desde el contenedor de base de datos o con `psql` en ambientes QA/producción.

## Reportes avanzados

Los endpoints del dashboard consumen las vistas materializadas y respetan filtros estándar:

- `from`, `to`: fechas `YYYY-MM-DD` para filtrar por `created_at`.
- `status`: lista separada por comas. Para `overview` se reconocen `pending|confirmed|scanned` (invitados) y `queued|sent|delivered|failed` (delivery).
- `organizerId`, `eventId`, `eventType` (`standard`/`premium`).
- `page`, `pageSize`, `sort` (`created_at|amount|tickets`) y `dir` (`asc|desc`).

### `/director/reports/overview`

Respuesta:

```json
{
  "meta": {
    "from": "2025-10-01",
    "to": "2025-10-31",
    "page": 1,
    "pageSize": 1,
    "generatedAt": "2025-11-01T03:00:00.000Z"
  },
  "data": [
    { "metric": "ticketsEquivalentDelivered", "value": 4200 },
    { "metric": "assignedValueCents", "value": 985000 },
    { "metric": "openDebtCents", "value": 125000 },
    { "metric": "activeOrganizers", "value": 18 },
    { "metric": "paymentsAppliedCents", "value": 860000 },
    { "metric": "guestsByStatus", "breakdown": [{ "status": "confirmed", "count": 320 }] },
    { "metric": "deliveriesByStatus", "breakdown": [{ "status": "delivered", "count": 2800 }] }
  ]
}
```

### `/director/reports/top-organizers`

Ejemplo:

```bash
curl -s "http://localhost:8080/director/reports/top-organizers?from=2025-10-01&to=2025-10-31&page=1&pageSize=5&sort=tickets&dir=desc"
```

Cada elemento de `data[]` contiene `organizerId`, `ticketsEquivalent`, `assignedValueCents` y `lastActivityAt`. El `meta` incluye `total` y `pages` para paginación.

### `/director/reports/debt-aging`

Retorna la deuda abierta agrupada en tramos de días. Ejemplo de `data`:

```json
[
  { "bucket": "0-30", "amountCents": 350000, "count": 12 },
  { "bucket": "31-60", "amountCents": 210000, "count": 6 },
  { "bucket": "61-90", "amountCents": 95000, "count": 3 },
  { "bucket": ">90", "amountCents": 180000, "count": 4 }
]
```

### `/director/reports/tickets-usage`

Permite analizar asignaciones por evento. Soporta `eventType=standard|premium` para distinguir conversiones.

```bash
curl -s "http://localhost:8080/director/reports/tickets-usage?eventType=premium&from=2025-09-01&to=2025-10-31&page=1&pageSize=10&sort=created_at"
```

Cada fila incluye `eventId`, `eventName`, `eventType`, `ticketsAssigned`, `ticketsEquivalent`, `assignedValueCents` y `lastMovementAt`.

## Cache y TTL

El overview financiero (`/director/overview`) se almacena en Redis por 30–60 s (`DIRECTOR_CACHE_TTL_SECONDS`). Los reportes avanzados usan claves independientes (`DIRECTOR_REPORT_CACHE_TTL_SECONDS`) con TTL corto (30–60 s). Cualquier asignación o pago invalida todas las claves (`director:overview`, `director:reports:*`). El worker `runKpiRefreshJob` refresca las vistas materializadas y precalienta la caché durante la madrugada.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `REDIS_URL` | Cache para KPIs y ledger. |
| `TICKET_PREMIUM_FACTOR` | Multiplicador para eventos tipo `premium`. |
| `DIRECTOR_CACHE_TTL_SECONDS` | TTL (segundos) para la caché de overview. |
| `DIRECTOR_REPORT_CACHE_TTL_SECONDS` | TTL de los reportes avanzados (`/director/reports/*`). |
| `KPI_REFRESH_INTERVAL_MINUTES` | Intervalo del job que refresca vistas y precalienta reportes (por defecto 30 min). |

## Flujo de pruebas

```bash
# Asignación de tickets (prepago)
curl -sS -X POST http://localhost:8080/director/assign \
  -H "Content-Type: application/json" \
  -d '{"organizerId":"org_demo","eventId":"ev_demo","type":"prepaid","tickets":100,"price":3.5}'

# Consulta de ledger
curl -sS http://localhost:8080/director/organizers/org_demo/ledger

# Pago registrado
curl -sS -X POST http://localhost:8080/director/payments \
  -H "Content-Type: application/json" \
  -d '{"organizerId":"org_demo","amount":1500,"currency":"mxn"}'
```

Las respuestas deben incluir `requestId`, la lista de movimientos y el saldo actualizado.
