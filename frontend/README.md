# Frontend containers (PWA & Dashboard)

Este directorio describe cómo levantar los frontends de Monotickets junto al backend utilizando Docker Compose tanto en desarrollo como en producción.

## Requisitos previos

- Docker Desktop o Docker Engine con soporte para Docker Compose v2.
- Puertos `3000` (PWA) y `3001` (Dashboard) libres en tu máquina local.
- El backend (`backend-api`) puede reutilizar la definición del stack de `infra/docker-compose.yml`; la composición del frontend lo extiende de forma automática.

## Variables de entorno relevantes

| Variable | Servicio | Valor por defecto | Descripción |
| --- | --- | --- | --- |
| `PWA_NEXT_PUBLIC_API_URL` | PWA (`pwa`, `pwa-prod`) | `http://backend-api:8080` en dev / `https://api.monotickets.mx` en prod | URL base de la API que consumen las invitaciones. |
| `DASHBOARD_NEXT_PUBLIC_API_URL` | Dashboard (`dashboard`, `dashboard-prod`) | `http://backend-api:8080` en dev / `https://api.monotickets.mx` en prod | URL base para organizer/staff/director. |
| `NODE_ENV` | Todos | Ajustado automáticamente según perfil | Define modo de ejecución de Next.js. |
| `NEXT_TELEMETRY_DISABLED` | Todos | `1` | Desactiva telemetría de Next.js. |

Puedes sobrescribir cualquiera de estas variables con `docker compose run -e VARIABLE=valor ...` o mediante un archivo `.env` en la raíz del repo.

## Desarrollo local

1. Construye e inicia los contenedores de frontend (y backend si aún no está corriendo):
   ```bash
   docker compose up --build backend-api pwa dashboard
   ```
   - `pwa` expone `http://localhost:3000` y levanta `next dev` con hot reload montando el código fuente local (`./frontend/pwa`).
   - `dashboard` expone `http://localhost:3001` y levanta `next dev` con hot reload montando `./frontend/dashboard`.
2. Verifica que ambos frontends resuelven contra la API en `http://backend-api:8080`. Si necesitas apuntar a otra API (por ejemplo staging), sobrescribe `PWA_NEXT_PUBLIC_API_URL` y `DASHBOARD_NEXT_PUBLIC_API_URL`.
3. Flujos a probar rápidamente:
   - **PWA**: visita `http://localhost:3000/public/invite/<code>` para validar que el PDF o flipbook se muestran según el tipo de evento y que el RSVP funciona.
   - **Staff dashboard**: visita `http://localhost:3001/staff/scan` desde un navegador móvil; verifica el feedback visual/háptico en los distintos casos de QR.

Para detener los servicios utiliza `Ctrl+C` o `docker compose down`.

## Despliegue / Producción local

La composición incluye servicios específicos para producción (`pwa-prod` y `dashboard-prod`) sin montajes de código y ejecutando `next start`.

1. Define las variables con la URL pública del backend, por ejemplo:
   ```bash
   export PWA_NEXT_PUBLIC_API_URL=https://api.monotickets.mx
   export DASHBOARD_NEXT_PUBLIC_API_URL=https://api.monotickets.mx
   ```
2. Construye e inicia las imágenes con el perfil de producción:
   ```bash
   docker compose --profile prod up --build -d backend-api pwa-prod dashboard-prod
   ```
3. Expone los servicios detrás de tu proxy/Nginx/Traefik según corresponda (`3000` para la PWA, `3001` para el dashboard). Los contenedores utilizan `next start`, por lo que cualquier CDN de estáticos debe respetar las rutas dinámicas del App Router.
4. Comprueba el estado con:
   ```bash
   curl -I http://localhost:3000/
   curl -I http://localhost:3001/
   ```
   Ambos endpoints deberían responder `200 OK` gracias a los `HEALTHCHECK` definidos.

Para detener el despliegue utiliza `docker compose --profile prod down`.

## Diagnóstico rápido

- Usa `docker compose logs -f pwa` o `dashboard`/`*-prod` para revisar el output de Next.js.
- Si la PWA no alcanza el backend, revisa el valor de `NEXT_PUBLIC_API_URL` desde las herramientas de desarrollador (`window.NEXT_PUBLIC_API_URL`).
- Verifica la salud de los servicios con `docker compose ps --format '{{.Name}}\t{{.State}}'` y asegúrate de que `backend-api` esté `running` antes de probar escaneos.
- En caso de requerir otro backend (por ejemplo un mock), ajusta las variables de API y reconstruye con `docker compose up --build ...`.

## Consideraciones adicionales

- El service worker de la PWA solo se activa en los servicios de producción (`pwa-prod`). Durante el desarrollo con `next dev` no se registra para evitar conflictos con HMR.
- Si desplegarás detrás de un proxy con HTTPS, asegúrate de propagar los encabezados `X-Forwarded-*` para que Next.js genere URLs correctas.
