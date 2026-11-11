# Configuración y cierre de entrega · AgroClima

## Supabase

- Proyecto enlazado: `fledooqwmwrjufeihoqn`.
- Confirmar que existan `farms` y `weather_history`.
- Revisar RLS y las políticas de propietario. La migración reproducible es `supabase/migrations/20261110090000_agroclima.sql`.
- URL del sitio: `https://amadorjara-alt.github.io/AgroClima/`.
- URL de redirección permitida: `https://amadorjara-alt.github.io/AgroClima/**`.
- El registro puede requerir confirmación del correo.
- No publicar `service_role` ni otras claves privadas en el frontend.

## GitHub Pages

- Publicar `main` desde la carpeta raíz del repositorio.
- Comprobar el sitio por HTTPS y abrir inicio, registro, acceso y dashboard.
- Confirmar que mapas y gráficos cargan y que la navegación queda usable en móvil.

## Demostración

- Usar una cuenta de prueba.
- Registrar manualmente el terreno de café para la demostración en Oxapampa.
- Consultar Open-Meteo, explicar los umbrales y las alertas mostradas.
- Abrir el historial guardado en Supabase.
- La alerta de lluvia depende del pronóstico real en el momento de exponer.

## Entregables

- URL funcional y repositorio actualizado.
- [Modelo de datos](MODELO_DE_DATOS.md).
- [Arquitectura y demostración](ARQUITECTURA_Y_DEMO.md).
- [Correspondencia con la rúbrica](RUBRICA_Y_SUSTENTACION.md).

