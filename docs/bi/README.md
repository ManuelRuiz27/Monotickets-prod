# Metabase para analistas

Metabase ofrece un espacio rápido para construir dashboards operativos sobre la base de datos de Monotickets. Este servicio es opcional y se levanta desde Docker Compose.

## Puesta en marcha

1. Levanta Metabase junto con Postgres:

   ```bash
   docker compose up -d database metabase
   ```

   - Metabase quedará disponible en [http://localhost:3002](http://localhost:3002).
   - El metastore se guarda en el volumen `metabase_data`, por lo que las configuraciones sobreviven reinicios del contenedor.

2. Primer inicio de sesión:
   - Al abrir la URL por primera vez, crea una cuenta de administrador para el equipo de datos.
   - Cuando Metabase pregunte por la base de datos a conectar, utiliza los parámetros definidos en tu `.env` (mismos que `infra/scripts/seed.sh`). Ejemplo:
     - **Host**: `database`
     - **Puerto**: `5432`
     - **Base de datos**: `monotickets`
     - **Usuario**: `postgres`
     - **Contraseña**: la misma que usas en desarrollo (definida en `DB_PASSWORD`).
   - Si prefieres configurar la conexión después, ve a *Admin settings → Databases* y agrega una nueva conexión tipo PostgreSQL.

## Configuración recomendada

1. Crea la colección `Monotickets – Operación` para agrupar tarjetas y dashboards operativos.
2. Desde la vista de datos, crea las primeras tarjetas sugeridas:
   - Conteo de invitados por `status` (tabla `guests`).
   - Conteo de `scan_logs` en los últimos 7 días segmentado por `result`.
3. Comparte la colección con los organizadores interesados y documenta brevemente el propósito de cada tarjeta en la descripción.

## Buenas prácticas de dashboard

- **Foco diario**: utiliza filtros por rango de fechas (día, semana, mes) para que los organizadores identifiquen confirmaciones y show-up recientes.
- **Drill-down**: enlaza tablas detalladas que permitan saltar desde indicadores agregados a los registros de invitados o bitácoras de envío cuando detecten anomalías.
- **Mensajes**: diferencia entre plantillas y mensajes de sesión (gratuitos) usando el campo `template` de `delivery_logs` para monitorear consumos y errores.
- **Rendimiento**: crea vistas o modelos con agregaciones simples si notas que los dashboards tardan en cargar; la semilla incluida debería responder instantáneamente en local.

## Próximos pasos

- Automatiza la creación de tarjetas clave (confirmaciones vs. pending, ratio de show-up, tasa de entrega de WhatsApp) mediante la API de Metabase o plantillas.
- Para necesidades de dirección ejecutiva, considera integrar Superset o herramientas adicionales sobre vistas materializadas.
