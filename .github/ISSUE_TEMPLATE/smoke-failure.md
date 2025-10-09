---
name: "🚨 Smoke Failure"
about: "Falla de disponibilidad o health-check de servicios"
title: "[SMOKE] {servicio} no responde — {entorno}"
labels: ["type:smoke","priority:p0","needs:owner"]
assignees: []
---

## Resumen
- Servicio afectado: <!-- backend/frontend/redis/wa-webhook -->

## Entorno
- Ambiente: <!-- staging/preprod/CI-local -->
- URLs / Commit SHA:

## Pasos para reproducir
- Comando / paso que falló (infra/check-services.sh o workflow smoke.yml):

## Resultado esperado

## Resultado obtenido

## Logs y evidencias
- Adjuntar `reports/junit/*.xml`, trace, screenshot

## Impacto
- <!-- bloqueo de E2E / Go-NoGo -->

## Checklist de mitigación
- [ ] Reinicio del servicio
- [ ] Rollback aplicado
- [ ] Owners contactados
