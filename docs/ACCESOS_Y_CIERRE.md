# Configuración pendiente para cerrar CompraSmart AI

## Accesos ya resueltos

GitHub permite escribir en amadorjara-alt/CompraSmart-AI. Supabase permite administrar CompraSmart-AI (fledooqwmwrjufeihoqn) en amadorjara-alt's Org. La cuenta del integrante debía tener Administrator para autorizar la conexión; Developer no bastaba para ese paso.

La web ya existe en https://amadorjara-alt.github.io/CompraSmart-AI/. No se necesita contratar hosting ni crear otro Supabase.

## Lo que debe introducir el grupo

**La clave gratuita se configura directamente en el servidor. El proyecto ya registra lecturas de OCR.space; estos pasos sirven para configurar o sustituir la clave cuando corresponda.**

1. Abrir https://ocr.space/ocrapi y solicitar la clave Free con un correo del grupo.
2. Guardarla desde la web → Integraciones → OCR.space → Configurar. El servidor la cifra con el secreto existente.
3. Como alternativa, el administrador puede abrir https://supabase.com/dashboard/project/fledooqwmwrjufeihoqn/functions/secrets y crear OCR_SPACE_API_KEY con la clave de OCR.space. Introducir su valor directamente en Supabase.
4. No compartir la clave en el chat ni publicarla en GitHub. No usar la clave pública de demostración para el grupo.
5. No regenerar CREDENTIALS_ENCRYPTION_KEY: los registros existentes necesitan el secreto original.

## Demostración final

Entrar con una cuenta del proyecto, subir el comprobante ficticio tests/fixtures/receipt-demo.png, revisar los dos productos y confirmar. Comprobar que el historial guarda 118 PEN y que el catálogo, proveedor y referencias reaparecen después de recargar.

Si se usan líneas sin impuestos, introducir 18 como impuesto adicional en ese fixture. Si los precios de una factura real ya incluyen IGV, introducir 0 adicional. No sumar el impuesto dos veces.

Un documento guardado sin clave puede procesarse después con su botón Procesar OCR; no es necesario volver a subirlo. Un borrador existente se recupera sin otra llamada al proveedor.

Para comparar, registrar otro comprobante ficticio de otro proveedor con el mismo nombre completo, marca y unidad. No mezclar presentaciones ni monedas. La alerta señala una diferencia de al menos 15% frente a la menor compra reciente del negocio.

## Registro, recuperación y extra de Google

El registro está habilitado y exige confirmar el correo. El dueño de la cuenta debe abrir su buzón y completar esa confirmación; no se requieren contraseñas compartidas.

Revisar en Supabase Auth las URL permitidas:

- https://amadorjara-alt.github.io/CompraSmart-AI/login.html
- https://amadorjara-alt.github.io/CompraSmart-AI/reset-password.html

Google Login aún está deshabilitado. Para incluir ese extra de la rúbrica, crear un cliente OAuth Web del grupo. El origen autorizado es https://amadorjara-alt.github.io y el callback de Google a Supabase es:

https://fledooqwmwrjufeihoqn.supabase.co/auth/v1/callback

El Client ID y Client Secret se introducen directamente en Supabase Auth → Google. No son claves de Gemini. Solicitar solo identidad básica; no Sheets ni Drive. Comprobar el login con una cuenta permitida y el regreso al login.html de la web.

La documentación de la configuración está en https://supabase.com/docs/guides/auth/social-sign-in/auth-google.

## Verificaciones ya ejecutadas

Ambas funciones nuevas están activas, RLS y confirmación pasaron pruebas reales con dos identidades, la API OCR leyó el fixture y 58 pruebas automáticas pasaron. Esto no sustituye la prueba interactiva final con la clave y las cuentas del grupo.

## Comprobación posterior

El proyecto ya registra lecturas de OCR.space y una compra confirmada. Las instrucciones de clave anteriores sirven para configurar o sustituirla, no implican que siga faltando. El resumen diferencia una clave guardada de una lectura realmente registrada.

## Reiniciar el historial (4 de noviembre de 2026)

En **Historial de compras → Reiniciar historial**, el usuario ve el negocio y la cantidad de comprobantes que va a eliminar. Debe escribir `ELIMINAR` y pulsar **Eliminar y reiniciar**. Cancelar o abrir el diálogo no modifica datos.

El reinicio elimina facturas terminadas y borradores, líneas de compra y referencias de precios del negocio actual. Conserva la cuenta, el negocio, el catálogo de productos, los proveedores, las claves y el consumo diario de OCR. Los registros de otros negocios y usuarios se conservan. El servidor comprueba la sesión, la propiedad del negocio y el conjunto exacto de facturas mostrado; rechaza confirmaciones antiguas y OCR activos.

Los archivos se eliminan mediante Storage API después de la transacción de compras. Si falla la conexión, una cola privada conserva las rutas y muestra **Completar limpieza de archivos**, que permite reintentar incluso después de recargar. Nunca se modifica `storage.objects` por SQL.

Pruebas: `tests/history-reset.test.mjs`, integración en `tests/ui.test.mjs` y `supabase/tests/reset-history-rls.sql`. La prueba SQL crea negocios ficticios, comprueba aislamiento entre dos usuarios y dos negocios del mismo propietario, y revierte todas sus filas. Instalar esta función no ejecuta un reinicio sobre los datos del grupo.

Verificación de esta entrega: 67 pruebas automáticas aprobadas, nueve archivos JavaScript verificados, prueba SQL con reversión aprobada y comprobación visual con datos ficticios. La función y la cola rechazan peticiones anónimas con HTTP 401. Los 10 comprobantes y archivos originales, cinco credenciales y dos solicitudes OCR permanecieron intactos tras aplicar la migración y probarla.


## Corrección móvil y búsqueda web

Se restauran la barra lateral y sus etiquetas, ocultas por reglas CSS antiguas. La navegación incluye fondo para cerrar, botón de cierre, Escape, gestión del foco y desbloqueo al cambiar de tamaño.

La búsqueda usa un solo campo para filtrar compras y consultar fuentes de Internet dentro del panel. La nueva función `search-products` mantiene `verify_jwt = true`, verifica además la identidad con Auth y llama al endpoint fijo de Tavily. No lee documentos privados ni requiere service_role. Valida la consulta, limita el tamaño del cuerpo, recorta los extractos, filtra enlaces inseguros y devuelve errores de cuota o conexión sin exponer respuestas privadas del proveedor. El acceso gratuito sin clave se probó con una consulta real de arroz; la pantalla se probó por separado con datos ficticios identificados como tales.

Validación: 78 pruebas automatizadas, verificación de 10 archivos JS y revisión visual en marcos de 390 × 844, 844 × 390 y 1280 × 850. Las pruebas visuales no se conectan a Supabase ni modifican compras reales. La publicación del frontend debe confirmarse en GitHub Pages antes de anunciar la actualización como visible.
