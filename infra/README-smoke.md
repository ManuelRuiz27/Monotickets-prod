# Smoke tests y monitoreo de disponibilidad

Este directorio contiene scripts para verificar la disponibilidad mínima del backend y frontend de Monotickets.

## Variables disponibles

- `BACKEND_URL`: Endpoint de health del backend. Valor por defecto `http://backend:3000/health`.
- `FRONTEND_URL`: Endpoint de health del frontend. Valor por defecto `http://frontend:3001/health`.

Puedes sobreescribirlas antes de ejecutar los scripts, por ejemplo:

```bash
BACKEND_URL=http://localhost:8080/health FRONTEND_URL=http://localhost:3001/health npm run smoke:services
```

## Ejecución local

1. Levanta los servicios requeridos:
   ```bash
   docker compose up -d backend-api dashboard
   ```
2. Ejecuta el script de readiness (opcional) y luego el de smoke:
   ```bash
   npm run smoke:readiness
   npm run smoke:services
   ```

El script `infra/check-readiness.sh` espera hasta 60 segundos a que los servicios respondan con HTTP 2xx. Si alguno no responde a tiempo, finaliza con código distinto de cero.

## Ejecución en CI

El workflow `smoke.yml` levanta los servicios declarados en `docker-compose.yml`, espera a que estén listos y ejecuta `npm run smoke:services`. Si el backend o frontend no responden con 2xx, el job falla y se detiene la ejecución de pruebas E2E.

## Interpretación de salidas

- `✅ Backend OK (200)`: el servicio respondió con éxito.
- `❌ Servicio caído: Backend ...`: el endpoint no respondió o devolvió un código distinto de 2xx.

El código de salida es `0` cuando ambos servicios están disponibles. Cualquier otro estado produce código `1`, permitiendo integrarlo en pipelines de CI/CD.
