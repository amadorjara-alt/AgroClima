# Registro de implementación · AgroClima

## Alcance

La aplicación activa está alineada con el Sistema Web de Monitoreo Agroclimático: autenticación, terrenos georreferenciados, pronósticos, alertas, mapa, dashboard e historial. Se mantiene el proyecto Supabase existente y se incorporan tablas agrícolas sin eliminar los datos previos.

## Persistencia

La migración `supabase/migrations/20261110090000_agroclima.sql` crea `farms` y `weather_history` con restricciones y RLS. El modelo y las relaciones se describen en [MODELO_DE_DATOS.md](MODELO_DE_DATOS.md).

## Componentes activos

- Páginas raíz en HTML y estilos en `css/agroclima.css`.
- Autenticación en `js/agro-auth.js` y cliente configurado en `js/supabase.js`.
- Dashboard, mapa, pronóstico, reglas y consultas en `js/agro-dashboard.js`.
- Servicios: Supabase, Open-Meteo, Nominatim, Leaflet y Chart.js.

## Revisión manual recomendada para la entrega

1. Crear una cuenta de demostración y comprobar el acceso.
2. Crear, editar y eliminar un terreno de prueba.
3. Consultar pronóstico y revisar el cálculo de alertas.
4. Verificar que el historial queda asociado al usuario y terreno.
5. Repetir la navegación en un ancho móvil.
