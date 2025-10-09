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
