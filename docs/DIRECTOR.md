# Servicio Director

El servicio Director expone los flujos financieros de Monotickets para administrar tickets asignados a organizadores, registrar pagos y consultar métricas agregadas.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/director/assign` | Registra una asignación de tickets prepago o préstamo. Requiere `organizerId`, `eventId`, `type` (`prepaid`/`loan`), `tickets` y `price`. |
| `GET` | `/director/organizers/:id/ledger` | Devuelve el historial de movimientos del organizador, incluyendo totales y saldo. |
| `POST` | `/director/payments` | Registra un pago recibido y descuenta la deuda abierta del organizador. |

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

## Cache y TTL

El overview financiero (`/director/overview`) se almacena en Redis por 30–60 s (`DIRECTOR_CACHE_TTL_SECONDS`). Cuando se registran nuevos pagos o asignaciones, la caché se invalida para evitar mostrar cifras obsoletas.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `REDIS_URL` | Cache para KPIs y ledger. |
| `TICKET_PREMIUM_FACTOR` | Multiplicador para eventos tipo `premium`. |
| `DIRECTOR_CACHE_TTL_SECONDS` | TTL (segundos) para la caché de overview. |

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
