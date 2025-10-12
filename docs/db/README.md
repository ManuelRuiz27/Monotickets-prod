# Base de datos Monotickets

Este directorio documenta cómo preparar y poblar la base de datos operacional utilizada por los servicios de Monotickets, tanto en entornos locales (Docker) como en Supabase.

## Requisitos previos

- Docker y Docker Compose.
- `psql` instalado en tu máquina o dentro del contenedor.
- Archivo `.env` con las credenciales de Postgres (ver `infra/README.md`).

## Ejecutar migraciones y semilla en local

1. Levanta la base de datos con Docker Compose (usa el archivo de infraestructura para asegurarte de que Postgres y Redis estén disponibles):

   ```bash
   docker compose -f infra/docker-compose.yml up -d database
   ```

2. Exporta las variables de conexión si necesitas valores distintos a los predeterminados (opcional):

   ```bash
   export DB_HOST=localhost
   export DB_PORT=5432
   export DB_NAME=monotickets
   export DB_USER=postgres
   export DB_PASSWORD=postgres
   ```

3. Ejecuta el script de migraciones y semilla:

   ```bash
   ./infra/scripts/seed.sh
   ```

   El script aplica, en orden, las migraciones SQL dentro de `infra/migrations/` (estructura base, particiones, índices y datos de prueba). Si prefieres usar una URL completa, define `DATABASE_URL` antes de ejecutar el script.

4. Verifica los conteos mínimos sugeridos para QA:

   ```sql
   SELECT COUNT(*) FROM events;           -- Debe regresar 2
   SELECT COUNT(*) FROM guests;           -- Entre 20 y 40
   SELECT COUNT(*) FROM invites;          -- Entre 20 y 40
   SELECT COUNT(*) FROM scan_logs;        -- Mayor a 80
   SELECT COUNT(*) FROM delivery_logs;    -- Mayor a 80
   ```

## Ejecutar migraciones en Supabase

1. Crea un archivo `.env.supabase` (o agrega a tu `.env`) las variables de conexión entregadas por Supabase (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`).
2. Abre una sesión de shell autenticada en Supabase (por ejemplo con `psql` o con `supabase db remote connect`).
3. Ejecuta las migraciones utilizando el mismo script:

   ```bash
   DB_HOST=your.supabase.host \
   DB_PORT=6543 \
   DB_NAME=postgres \
   DB_USER=postgres \
   DB_PASSWORD=super-secret \
   ./infra/scripts/seed.sh
   ```

   - Para bases remotas con certificados SSL asegúrate de incluir los parámetros adicionales requeridos por tu proveedor (por ejemplo `sslmode=require` dentro de `DATABASE_URL`).
   - Si solo quieres aplicar la estructura sin datos de prueba, ejecuta manualmente los archivos `000_init_core.sql`, `010_partitions_scan_logs.sql` y `020_indexes.sql`.

## Consideraciones adicionales

- Las particiones mensuales de `scan_logs` se crean para el mes anterior y el actual. Revisa el comentario dentro de `010_partitions_scan_logs.sql` para automatizar la retención de 90–180 días.
- La semilla incluye escenarios de confirmación, escaneo (show-up) y bitácoras de mensajes para validar dashboards y flujos operativos.
- Para aplicar las nuevas particiones de `delivery_logs` + vistas materializadas, ejecuta el archivo `docs/db/migrations/20240615001_delivery_director.sql` después de `infra/migrations/020_indexes.sql` (puedes usar `psql -f` o copiar los bloques necesarios).
- Para habilitar el ledger de Director y las vistas de KPIs actualizadas usa también `docs/db/migrations/20240701001_director_ledger.sql`. Posteriormente refresca las vistas con `psql -f docs/db/migrations/refresh_kpis.sql`.
- Para ambientes productivos, reemplaza la semilla por tus propios datos y ajusta las políticas de retención antes de exponer la base a clientes finales.
