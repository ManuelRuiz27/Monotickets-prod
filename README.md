# Monotickets · Plataforma de validación de accesos

Monotickets es una plataforma para emitir invitaciones digitales y validar el acceso a eventos. En este repositorio conviven los servicios HTTP, las aplicaciones de experiencia web, los workers que procesan colas y la infraestructura necesaria para levantar el ecosistema completo con Docker y ejecutar pruebas end-to-end.

## Arquitectura del repositorio

La solución está organizada como un monorepo con los siguientes componentes principales:

- **Backend (`backend/`)**: API HTTP en Node.js/Express que expone endpoints de salud, operaciones de invitados y validación de códigos. Incluye workers especializados que monitorean Redis y ejecutan tareas en segundo plano.
- **Frontends (`frontend/`)**: contiene tres aplicaciones:
  - `frontend/server.js` expone la landing estática y un panel mínimo.
  - `frontend/pwa` es la PWA (Next.js) orientada al público.
  - `frontend/dashboard` es el panel operativo (Next.js) para staff.
- **Infraestructura (`infra/`)**: definiciones de Docker Compose reutilizables, health checks y scripts de humo para validar la orquestación.
- **Pruebas (`tests/`)**: suites end-to-end con Playwright y Testsprite, además de utilidades para recolectar reportes y métricas.
- **Recursos compartidos (`shared/` y `docs/`)**: librerías transversales, documentación de entorno y manuales operativos.

## Requisitos del entorno

- Docker Desktop o Docker Engine 24+ con el plugin de Docker Compose 2.x.
- 4 GB de RAM disponibles para los contenedores (PostgreSQL, Redis, frontends y Metabase corren en paralelo).
- `make`, `bash` y `curl` instalados para ejecutar scripts auxiliares (opcional pero recomendado).
- Node.js 20 y npm 10 solo si quieres ejecutar servicios sin contenedores.

## Configuración inicial

1. Copia el archivo de ejemplo y ajusta credenciales según tu contexto local:

   ```bash
   cp .env.example .env
   ```

2. Revisa las variables en `.env` (base de datos, Redis, claves externas) y actualiza los valores sensibles. La referencia completa está en `docs/docker-env.md`.

3. Si necesitas rutas locales persistentes (por ejemplo para archivos subidos), crea un `docker-compose.override.yml` siguiendo las recomendaciones del mismo documento.

## Despliegue con Docker Compose

El archivo `docker-compose.yml` en la raíz orquesta todos los servicios apoyándose en las definiciones base de `infra/docker-compose.yml`.

### Levantar el entorno de desarrollo

```bash
docker compose up --build database redis backend-api workers pwa dashboard
```

- API disponible en `http://localhost:8080` (verifica con `curl http://localhost:8080/health`).
- PWA en `http://localhost:3000` y dashboard en `http://localhost:3001`.
- Metabase es opcional; puedes agregarlo al comando anterior (`... metabase`).
- Para seguir los logs de un servicio usa `docker compose logs -f backend-api`.

Cuando termines, libera recursos con:

```bash
docker compose down --remove-orphans
```

### Levantar el perfil de producción local

Los servicios `pwa-prod` y `dashboard-prod` ejecutan la compilación de Next.js dentro del contenedor antes de iniciarse:

```bash
docker compose --profile prod up --build database redis backend-api workers pwa-prod dashboard-prod
```

Los contenedores ejecutan `npm install` automáticamente, por lo que no necesitas dependencias instaladas en tu máquina anfitrión.

## Pruebas y verificación

### Health checks y smoke tests

1. Con el stack en marcha, ejecuta los scripts de humo usando el contenedor de pruebas:

   ```bash
   docker compose run --rm --entrypoint "npm" tests run smoke:services
   ```

2. Para verificar readiness de manera extendida:

   ```bash
   docker compose run --rm --entrypoint "npm" tests run smoke:readiness
   ```

### Pruebas end-to-end

1. Asegúrate de que `backend-api`, `pwa` y `dashboard` estén arriba.
2. Lanza la suite completa de Playwright/Testsprite:

   ```bash
   docker compose run --rm tests
   ```

Los reportes se almacenan en `reports/` y `coverage/`. Si necesitas repetir un escenario específico, consulta los scripts en `tests/package.json` (por ejemplo `npm run test:e2e:guests --prefix tests`).

### Pruebas locales sin contenedores

Si prefieres ejecutar servicios directamente en tu máquina:

```bash
npm install --prefix backend
npm install --prefix frontend/pwa
npm install --prefix frontend/dashboard
npm run dev --prefix backend
npm run dev --prefix frontend/pwa
```

Recuerda ajustar en `.env` los hosts de base de datos y Redis (`127.0.0.1`) cuando no uses la red de Docker.

## Recursos adicionales

- Variables de entorno documentadas: `docs/docker-env.md`
- Guías de pipelines y flujos Git: `docs/git-structure.md`
- Scripts de verificación de servicios: `infra/check-services.sh`, `infra/check-readiness.sh`

Si detectas nuevas necesidades (más workers, microservicios adicionales o dashboards), replica el patrón actual: define variables en `.env`, añade el servicio a `docker-compose.yml` y documenta el flujo correspondiente.
