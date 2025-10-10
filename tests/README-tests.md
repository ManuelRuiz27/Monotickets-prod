# Contenedor de pruebas E2E y QA

Este contenedor empaqueta las dependencias necesarias para ejecutar las suites E2E con [TestSprite](https://github.com/turbot/ava). Sigue estas instrucciones para construir y ejecutar las pruebas dentro de Docker Compose.

## Construcción

```bash
docker compose build tests
```

## Ejecución

```bash
docker compose run --rm tests
```

## Reportes y artefactos

- Reportes JUnit: `./reports/junit/`
- Reportes Allure: `./reports/allure/`
- Cobertura (Playwright/Cypress): `./coverage/`
- Trazas, videos y capturas: `./tests/artifacts/`

Los directorios anteriores se generan/actualizan después de cada ejecución. Puedes recopilar información adicional ejecutando `npm run test:post`.

## Variables de entorno soportadas

| Variable             | Descripción                                               | Valor por defecto                         |
| -------------------- | --------------------------------------------------------- | ----------------------------------------- |
| `BASE_URL_FRONTEND`  | URL del frontend a probar                                 | `http://frontend:3001`                    |
| `BASE_URL_BACKEND`   | URL del backend a probar                                  | `http://backend:3000`                     |
| `WA_WEBHOOK_URL`     | Webhook simulado para flujos de WhatsApp                  | `http://backend:3000/wa/webhook`          |
| `TEST_TIMEOUT`       | Timeout máximo por suite (ms)                             | `300000`                                  |
| `HEADLESS`           | Ejecutar navegadores en modo headless (`1` = sí, `0` = no) | `1`                                       |
| `CI`                 | Indica ejecución en entorno CI                            | `1`                                       |

Exporta las variables anteriores antes de ejecutar el contenedor si necesitas personalizarlas.

## Suites y tags disponibles

Los flujos E2E se organizan por tags. Puedes ejecutarlos de forma selectiva con los siguientes scripts:

| Script                         | Tags ejecutados           | Descripción                                     |
| ------------------------------ | ------------------------- | ----------------------------------------------- |
| `npm run test:e2e:guest`       | `@confirm`                | Flujo de invitado: confirmación desde landing   |
| `npm run test:e2e:staff`       | `@scan`                   | Flujo de staff: escaneo y validaciones          |
| `npm run test:e2e:wa`          | `@wa`                     | Flujos previos de organizadores/WhatsApp        |
| `npm run test:e2e:delivery`    | `@delivery`               | Módulo Delivery (WhatsApp/colas/webhook)        |
| `npm run test:e2e:director`    | `@director`, `@kpi`       | Panel Director (overview, KPIs y regresiones)   |

También puedes llamar directamente a `testsprite run -t <tag>` para combinar varios tags en una sola ejecución.

## Datos semilla mínimos

Las suites nuevas esperan un dataset determinista para evitar flakes:

- **Códigos QR**: al menos uno válido (`MONO-QR-0001`), uno duplicado (`MONO-QR-0001-DUP`), uno inválido (`NOT-A-QR`) y uno asociado a evento expirado (`MONO-QR-ARCHIVED`).
- **Staff**: token `STAFF-TOKEN-001` con ubicación `main-gate`.
- **Delivery**: evento `demo-event` con plantillas `ticket_confirmation`, `ticket_followup` y `ticket_reminder`. Para escenarios especiales se pueden usar flags como `simulateWindowExpired`, `simulateTransientFailure` o `simulateDuplicate` en el payload.
- **Director**: métricas base confirmadas=2, show-up=1, deliveries=3 para validar consistencia.

Las rutas por defecto (`/delivery/whatsapp/send`, `/delivery/logs`, `/director/overview`, etc.) se pueden sobreescribir mediante variables de entorno `DELIVERY_ROUTE_*` y `DIRECTOR_ROUTE_*` si la infraestructura difiere.

## Cross-browser en Playwright

El runner de Playwright define los proyectos `chromium`, `firefox` y `webkit`, con `retries=1` en CI y artefactos (videos, traces, screenshots) guardados en `tests/artifacts/`. Para ejecutar una matriz local:

```bash
npx playwright test --config tests/playwright.config.ts
# o un navegador específico
npx playwright test --config tests/playwright.config.ts --project=firefox
```

En CI (`qa.yml`) se expone una matriz de navegadores que publica los artefactos y JUnit a `reports/junit/`.

## Pruebas de rendimiento (k6)

Los scripts de carga viven en `tests/perf_k6/` y producen resúmenes JSON en `reports/perf/`.

```bash
# Spike de /scan/validate con mezcla de QR válidos/duplicados/inválidos
npm run perf:scan

# Ráfagas de confirmaciones + lecturas de invite
npm run perf:confirm
```

Variables relevantes:

- `SCAN_QR_VALID`, `SCAN_QR_DUP`, `SCAN_QR_INVALID`: códigos utilizados en el spike.
- `CONFIRM_CODES_CSV`: lista separada por comas de códigos para confirmar.
- `SCAN_SOAK_DURATION`, `CONFIRM_SOAK_DURATION`: duración de los escenarios soak.

Los thresholds por defecto requieren `http_req_failed < 1%`, `p95 <= 300ms` para `scan` y `p95 <= 400ms` para `confirm`.
