# Monotickets

Monotickets es una plataforma de emisión y validación de boletos para eventos. Este repositorio contiene los servicios mínimos para exponer un API de check-in, una interfaz estática para staff y la infraestructura necesaria para pruebas end-to-end, base de datos y colas de trabajo.

## Contenido principal del repositorio

- `backend/`: API HTTP en Node.js que expone endpoints de salud, listado de invitados y validación de códigos de acceso. Incluye un worker que monitorea Redis.
- `frontend/`: Servidor HTTP ligero que sirve la página pública y un panel básico para staff.
- `infra/`: Definiciones de Docker Compose y scripts de smoke tests para levantar el stack completo (PostgreSQL, Redis, API, frontend y workers).
- `shared/`: Espacio reservado para librerías o activos compartidos entre servicios.
- `tests/`: Configuración de suites end-to-end con TestSprite y scripts para recolectar artefactos.
- `docs/`: Guías internas (por ejemplo `docs/docker-env.md` con la referencia de variables de entorno).

## Requisitos previos

- Node.js 20.x y npm 10.x para ejecutar los servicios directamente.
- Docker 24+ y Docker Compose plugin 2.x para orquestar la infraestructura.
- Acceso a una terminal Bash (los scripts y comandos de ejemplo asumen este shell).

## Configuración de entorno

1. Copia el archivo `.env.example` en la raíz y renómbralo a `.env`.

   ```bash
   cp .env.example .env
   ```

2. Revisa y ajusta valores sensibles según tu entorno (por ejemplo `JWT_SECRET`, credenciales de base de datos o claves de servicios externos). La tabla detallada de variables se encuentra en `docs/docker-env.md`.

3. Si deseas montar una carpeta local para archivos subidos, crea un `docker-compose.override.yml` siguiendo el ejemplo al final de `docs/docker-env.md`.

## Puesta en marcha con Docker Compose

Esta es la forma más rápida de levantar todos los componentes (API, frontend, workers, PostgreSQL y Redis):

```bash
docker compose -f infra/docker-compose.yml up --build database redis backend-api frontend workers
```

- La API quedará expuesta en `http://localhost:8080` (endpoint de salud: `/health`).
- El frontend básico quedará disponible en `http://localhost:3000`.
- Los contenedores usan la configuración de `.env` y comparten la red `monotickets_net`.
- Para ejecutar las pruebas end-to-end dentro del entorno orquestado, levanta los servicios anteriores y luego lanza `docker compose -f infra/docker-compose.yml run --rm tests`.

> Nota: El archivo `docker-compose.yml` en la raíz define perfiles adicionales para aplicaciones Next.js (`frontend/pwa` y `frontend/dashboard`) que todavía no se incluyen en este snapshot. Para desarrollo local utiliza el archivo dentro de `infra/`.

## Ejecución local sin contenedores

1. Inicia los servicios externos (PostgreSQL y Redis). Puedes reutilizar Docker Compose solo para ellos:

   ```bash
   docker compose -f infra/docker-compose.yml up database redis
   ```

2. Instala dependencias en cada servicio JavaScript:

   ```bash
   npm install --prefix backend
   npm install --prefix frontend
   ```

3. Levanta el backend y el frontend en terminals separadas:

   ```bash
   npm run dev --prefix backend   # expone el API en http://localhost:8080
   npm run dev --prefix frontend  # expone la UI en http://localhost:3000
   ```

4. Asegúrate de que el backend pueda resolver las variables de conexión (`DB_HOST`, `DB_PORT`, `REDIS_URL`, etc.). Si usas Docker para la base de datos y Redis, mantén ajustado `DB_HOST=127.0.0.1` y `REDIS_URL=redis://127.0.0.1:6379` en tu `.env`.

## Pruebas y scripts útiles

- `npm run test`: Ejecuta place-holders de pruebas unitarias tanto en `backend` como en `frontend`.
- `npm run test:e2e:all`: Ejecuta el runner Node (`tests/scripts/run-e2e.js`) que valida health checks, flujo de invitados, validación de códigos y webhook de WhatsApp sobre servicios en marcha.
- `npm run smoke:services`: Script que verifica que los contenedores fundamentales respondan correctamente.

Consulta `infra/check-services.sh` y `infra/check-readiness.sh` para entender cómo se validan los servicios en pipelines.

## Documentación adicional

- Referencia de configuración: `docs/docker-env.md`
- Estructura de ramas y flujos de trabajo: `docs/git-structure.md`
- Manuales internos de BI y base de datos: `docs/bi/`, `docs/db/`

Si necesitas ampliar la plataforma (por ejemplo incorporar las aplicaciones Next.js de PWA o Dashboard), sigue la misma estrategia: definir el entorno en `.env`, agregar los servicios correspondientes en Docker Compose y documentar los pasos en este archivo.
