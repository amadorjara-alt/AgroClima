# CompraSmart AI

Proyecto académico del grupo para organizar comprobantes y comparar costes de compras anteriores.

**Web del grupo:** https://amadorjara-alt.github.io/CompraSmart-AI/

Usa el proyecto Supabase existente, CompraSmart-AI (fledooqwmwrjufeihoqn). El OCR utiliza **OCR.space Free**, motor 2, y reglas de extracción. No llama a Google ni Gemini.

## Puesta en marcha del grupo

1. Solicitar una clave gratuita en https://ocr.space/ocrapi.
2. Iniciar sesión en la web y abrir **Integraciones → OCR.space → Configurar**. La clave se envía al servidor y se guarda cifrada. No pegarla en el chat ni en GitHub.
3. Alternativamente, el administrador puede introducirla directamente en Supabase → Edge Functions → Secrets con el nombre **OCR_SPACE_API_KEY**. No sustituir CREDENTIALS_ENCRYPTION_KEY.
4. Subir un JPG, PNG o PDF de hasta 900 KB; PDF de hasta tres páginas.
5. Revisar proveedor, fecha, moneda, productos, presentación, unidad, impuestos adicionales y total. Confirmar la compra para guardar los datos relacionados.
6. Consultar historial y comparación. Se necesitan compras de dos proveedores para comparar el mismo producto, marca, unidad y moneda.

La aplicación limita los intentos a 20 por usuario y 200 en todo el proyecto cada 24 horas. La clave pública de demostración se utiliza exclusivamente en pruebas manuales, nunca como configuración del servidor.

## Verificación

    npm ci
    npm test
    npm run check

Las pruebas automáticas usan datos ficticios y clientes simulados. Los archivos de supabase/tests/ verifican las transacciones y RLS en la base real, con reversión de todos los datos de prueba. La prueba externa aislada se ejecuta manualmente con:

    node scripts/probe-ocr.mjs --public-demo

El fixture está marcado sin validez: dos productos, subtotal 100, IGV 18 y total 118. La prueba externa no sustituye la demostración completa con una cuenta y la clave del grupo.

## Documentación

- [Auditoría, cambios, pruebas y límites](docs/AUDITORIA_Y_RECUPERACION.md).
- [Rúbrica, secuencia y sustentación](docs/RUBRICA_Y_SUSTENTACION.md).
- [Configuración pendiente del grupo](docs/ACCESOS_Y_CIERRE.md).

Las ampliaciones de scraping, Sheets, Drive, Excel, automatizaciones y bot de Telegram aún no están implementadas. Google Login es opcional: su código está preparado, pero el proveedor sigue desactivado en Supabase. El login principal utiliza correo y contraseña.

## Menú móvil y búsqueda dentro del panel

En el celular, el botón ☰ abre todas las secciones. El menú se cierra con ×, tocando el fondo, con Escape o al elegir una sección. Al pasar a escritorio vuelve a ser una barra lateral y el contenido queda disponible.

En **Comparar precios**, un solo campo filtra las compras confirmadas mientras escribes. **Buscar** consulta la API de Tavily y muestra títulos, extractos y enlaces de las fuentes dentro de la misma página. Los extractos web se consultan con cada proveedor; no se guardan automáticamente como precios confirmados ni se usan para calcular alertas.

La función `search-products` exige una sesión válida de Supabase. Utiliza el acceso gratuito `keyless` de Tavily para uso ligero, sin otra cuenta ni una clave en el navegador. Este acceso tiene límites del proveedor. Si se alcanza el límite, se informa en pantalla y las compras guardadas siguen disponibles. Opcionalmente, el administrador puede crear una cuenta gratuita en Tavily y guardar `TAVILY_API_KEY` en **Supabase → Edge Functions → Secrets**. La clave solo se envía desde el servidor a Tavily. No se activa facturación ni se cambian las claves de OCR.

Para contener llamadas repetidas hay caché de fuentes públicas durante cinco minutos, deduplicación de consultas en curso y un límite de cinco consultas nuevas por minuto y usuario en cada instancia de la función. Esta protección en memoria no sustituye los límites globales del proveedor.

Documentación: https://docs.tavily.com/documentation/keyless y https://docs.tavily.com/documentation/api-reference/endpoint/search.
