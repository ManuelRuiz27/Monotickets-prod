# Base de datos · Migraciones y semilla

Este proyecto utiliza PostgreSQL (compatible con Supabase) orquestado desde `infra/docker-compose.yml`. Sigue estos pasos para crear la base de datos local con el esquema inicial, datos de ejemplo y vistas materializadas para BI.

## 1. Levantar la base de datos

El stack principal ya se documenta en el `README.md` raíz. Para un entorno mínimo de base de datos basta con iniciar el servicio `database` definido en Compose:

```bash
docker compose -f infra/docker-compose.yml up -d database
```

Los parámetros (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) provienen de tu archivo `.env`. Si es la primera vez que lo ejecutas, PostgreSQL inicializará el volumen `pg_data` automáticamente.

## 2. Ejecutar migraciones y seed

El script `infra/scripts/seed.sh` aplica en orden todas las migraciones de `infra/migrations/` y finalmente carga la semilla `040_seed.sql`.
Necesitas tener el cliente `psql` disponible (se instala junto con PostgreSQL). Si prefieres no instalarlo en tu host, ejecuta el script dentro del contenedor con `docker compose exec database bash`.

```bash
# Desde la raíz del repo
./infra/scripts/seed.sh
```

Por defecto el script usa las variables de entorno (`DB_HOST=localhost`, `DB_PORT=5432`, etc.). Si ejecutas el comando desde fuera del contenedor puedes exportar los valores o utilizar `DATABASE_URL`:

```bash
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres ./infra/scripts/seed.sh
# o
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/monotickets" ./infra/scripts/seed.sh
```

Al finalizar, deberías tener:

- 10 organizadores con precios diferenciados, estados (`active/suspended/archived`) y metadatos para billing.
- 2 eventos activos (standard y premium) con 16 invitados cada uno.
- Bitácoras de envíos y escaneos (>80 registros) con datos distribuidos en las dos particiones mensuales de `scan_logs`.
- Tablas financieras (`ticket_ledger`, `payments`) con >30 movimientos para cálculos de deuda y conciliación.
- Vistas materializadas refrescadas (`mv_*`) listas para su consumo en Metabase.

## 3. Refrescos programados

Si tu Postgres soporta `pg_cron`, la migración `110_pg_cron_refresh.sql` registra tareas para refrescar las vistas cada 5, 10 o 60 minutos. En entornos donde `pg_cron` no esté disponible, consulta la nota en `docs/bi/kpis.md` para levantar un worker externo que ejecute `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

## 4. Limpieza y resiembra

Para regenerar los datos simplemente elimina el volumen `pg_data` y repite los pasos:

```bash
docker compose -f infra/docker-compose.yml down -v
# luego vuelve a levantar y corre seed.sh
```

> **Tip:** los comandos de docker-compose se pueden encadenar con otros servicios (`redis`, `backend-api`, etc.) una vez que la base está lista.
