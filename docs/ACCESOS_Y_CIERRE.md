# Configuración pendiente para cerrar CompraSmart AI

## Accesos ya resueltos

GitHub permite escribir en amadorjara-alt/CompraSmart-AI. Supabase permite administrar CompraSmart-AI (fledooqwmwrjufeihoqn) en amadorjara-alt's Org. La cuenta del integrante debía tener Administrator para autorizar la conexión; Developer no bastaba para ese paso.

La web ya existe en https://amadorjara-alt.github.io/CompraSmart-AI/. No se necesita contratar hosting ni crear otro Supabase.

## Lo que debe introducir el grupo

**Falta una clave API gratuita de OCR.space para comprobar el recorrido completo.**

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

Ambas funciones nuevas están activas, RLS y confirmación pasaron pruebas reales con dos identidades, la API OCR leyó el fixture y 55 pruebas automáticas pasaron. Esto no sustituye la prueba interactiva final con la clave y las cuentas del grupo.
