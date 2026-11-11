# Sustentación y rúbrica · AgroClima

## Problema y propósito

Una empresa agrícola administra parcelas en distintas regiones del Perú. Consultar manualmente varias fuentes meteorológicas dificulta planificar labores y anticipar lluvia, viento o temperaturas extremas. AgroClima centraliza los terrenos y sus pronósticos para que cada usuario vea condiciones, compare umbrales propios y consulte el historial.

## Correspondencia con los requisitos

| Código | Requisito | Evidencia en la aplicación |
|---|---|---|
| RF01 | Autenticación | Registro, inicio de sesión y recuperación con Supabase Auth. |
| RF02 | Terrenos | CRUD de nombre, cultivo, superficie, localidad y coordenadas. |
| RF03 | Mapa | Leaflet/OpenStreetMap con marcadores y selección de punto. |
| RF04 | Clima | Open-Meteo: temperatura, lluvia, humedad y viento para siete días. |
| RF05 | Dirección | Nominatim obtiene localidad aproximada desde coordenadas. |
| RF06 | Alertas | Reglas por terreno para lluvia, viento, mínima y máxima de temperatura. |
| RF07 | Historial | Pronósticos diarios persistidos en `weather_history` de Supabase. |
| RF08 | Dashboard | Resumen, alertas, mapa, gráfico de lluvia, condiciones e historial. |
| Despliegue | GitHub Pages HTTPS | Publicación estática desde `main` y raíz del repositorio. |
| Seguridad | RLS | Cada usuario solo consulta y modifica terrenos e historial propios. |

## Demostración obligatoria

1. Crear una cuenta y entrar.
2. En **Terrenos**, registrar manualmente el terreno de café que se presentará en la demostración. La aplicación no trae un terreno de ejemplo precargado.
3. Abrir **Clima**, elegir la finca y pulsar **Consultar pronóstico**.
4. Leer temperatura, precipitación, humedad y viento; mostrar las alertas que se activen contra los umbrales del terreno.
5. Abrir **Historial** y comprobar las fechas que se guardaron.
6. En **Umbrales**, ajustar el límite de precipitación y explicar cómo la regla se evalúa de nuevo.

La precipitación es un pronóstico real y variable. La demo no simula condiciones: si Open-Meteo no supera el umbral actual, explicar la regla y se puede revisar una fecha o configurar el valor requerido para demostrar una alerta real con el dato recibido.

## Distribución sugerida del equipo

- Interfaz: diseño responsive, accesibilidad, mapas y visualizaciones.
- Datos y seguridad: esquema, restricciones, sesión y políticas RLS.
- Integraciones: Open-Meteo, Nominatim, Leaflet y Chart.js.

Cada integrante debe conocer el flujo completo: autenticación → terreno → pronóstico → reglas → historial.
