# AgroClima · Sistema Web de Monitoreo Agroclimático

Aplicación web para registrar terrenos agrícolas en Perú, consultar pronósticos por ubicación, activar alertas configurables y conservar el historial meteorológico de cada cuenta.

**Aplicación:** https://amadorjara-alt.github.io/AgroClima/
**Repositorio:** https://github.com/amadorjara-alt/AgroClima

## Alcance de la rúbrica

- **RF01 · Autenticación:** Supabase Auth con Google y correo, confirmación de correo, inicio de sesión y restablecimiento de contraseña.
- **RF02 · Terrenos:** alta, edición y eliminación de nombre, cultivo, superficie, localidad y coordenadas.
- **RF03 · Mapa:** Leaflet y OpenStreetMap para ubicar los terrenos y seleccionar coordenadas.
- **RF04 · Clima:** Open-Meteo para temperatura, precipitación, humedad y viento, con pronóstico de siete días.
- **RF05 · Dirección:** Nominatim convierte coordenadas en una localidad aproximada.
- **RF06 · Alertas:** umbrales por terreno para lluvia, viento y temperaturas mínima/máxima.
- **RF07 · Historial:** cada pronóstico diario consultado se almacena en PostgreSQL de Supabase.
- **RF08 · Dashboard:** resumen de terrenos, estado meteorológico, alertas, gráficos de lluvia y temperatura, y consultas anteriores.
- **Ayuda:** guía visual con recorrido interactivo y asistente Gemini opcional.
- **Caso de demostración:** terreno de café en Oxapampa, consulta de pronóstico, alerta si la lluvia supera el umbral y revisión del historial.

## Secuencia de uso

1. Crear una cuenta o iniciar sesión.
2. Registrar manualmente el terreno que se usará en la demostración; no hay terrenos precargados.
3. Seleccionar el terreno en **Clima** y consultar el pronóstico.
4. Revisar variables meteorológicas, gráfico y alertas calculadas con los umbrales del terreno.
5. Abrir **Historial** para revisar las filas guardadas en Supabase; ajustar reglas desde **Umbrales**.

La lluvia del pronóstico cambia según Open-Meteo. La aplicación muestra una alerta únicamente si los datos recibidos superan el valor configurado; no inventa ni fuerza un evento meteorológico.

## Configuración de Supabase

El proyecto `fledooqwmwrjufeihoqn` contiene las tablas `farms` y `weather_history`, con RLS para aislar los registros por usuario. La migración reproducible está en [`supabase/migrations/20261110090000_agroclima.sql`](supabase/migrations/20261110090000_agroclima.sql). Se aplicó sin eliminar ni alterar las tablas anteriores.

La configuración del navegador está en `js/supabase.js` y usa la clave pública `publishable`; nunca incluir una clave `service_role` en GitHub Pages. En Supabase → Authentication → URL Configuration, usar como URL del sitio `https://amadorjara-alt.github.io/AgroClima/` y permitir `https://amadorjara-alt.github.io/AgroClima/**` como URL de redirección. En el proveedor Email, mantener habilitada la confirmación del correo.

La página [`integrations.html`](integrations.html) explica qué servicios requieren claves. Open-Meteo, Nominatim, Leaflet y Chart.js no requieren una clave individual para este proyecto. Gemini es opcional: cada usuario puede guardarla o quitarla desde esa página; Supabase la cifra en el servidor y la clave nunca se entrega al navegador.

## Desarrollo y publicación

Es un sitio estático HTML, CSS y JavaScript. Abrir `index.html` o servir la raíz del repositorio con un servidor estático. GitHub Pages debe publicar la rama `main` desde la carpeta raíz. No se necesita instalar un backend propio.

## Servicios y atribución

- [Open-Meteo](https://open-meteo.com/) · Pronósticos meteorológicos.
- [Nominatim](https://nominatim.org/) · Geocodificación inversa; solicitudes limitadas para respetar su política de uso.
- [Leaflet](https://leafletjs.com/) · Biblioteca de mapas.
- [Chart.js](https://www.chartjs.org/) · Gráficos de precipitación y temperatura.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) · Datos de mapa, atribución visible en el mapa.

## Documentación de entrega

- [Modelo de datos](docs/MODELO_DE_DATOS.md).
- [Arquitectura, secuencia y guion de demostración](docs/ARQUITECTURA_Y_DEMO.md).
- [Migración de base de datos](supabase/migrations/20261110090000_agroclima.sql).

