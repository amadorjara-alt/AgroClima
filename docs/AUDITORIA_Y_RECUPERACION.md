# CompraSmart AI: auditoría y recuperación

Actualización: 4 de noviembre de 2026. Repositorio: https://github.com/amadorjara-alt/CompraSmart-AI.
Proyecto conservado: CompraSmart-AI, referencia fledooqwmwrjufeihoqn.
Web comprobada con HTTP 200: https://amadorjara-alt.github.io/CompraSmart-AI/.

## Accesos y conservación

La escritura de GitHub y el acceso administrativo al Supabase correcto están habilitados. No hace falta otra invitación ni compartir contraseñas. La URL y clave publicable originales coinciden con el proyecto real y se conservan.

Se comparó el ZIP con GitHub y se mantuvieron los cinco archivos JavaScript más recientes del repositorio. El parser anterior se recuperó sin copiar el almacenamiento de claves ni las llamadas a Gemini desde el navegador.

El estado previo del esquema, índices y políticas está en supabase/audit/before-reviewed-ocr.json; no contiene documentos, correos ni credenciales. Se comparó la función desplegada original antes de sustituirla. Su respaldo permanece local: no se publica el código antiguo que llamaba a Gemini. La fuente nueva de process-invoice utiliza únicamente OCR.space. El respaldo local del frontend original es backup/original-df3569c.

Los recuentos al terminar las pruebas reales siguen siendo: 2 negocios, 8 facturas, 4 credenciales cifradas, 0 productos, 0 proveedores, 0 líneas y 0 precios. Los datos de prueba se revirtieron. No se rotó el secreto de cifrado ni se eliminaron credenciales o archivos.

## Diagnóstico y comportamiento resultante

| Problema comprobado | Cambio |
| --- | --- |
| La función desplegada llamaba a Gemini y marcaba completed sin guardar productos ni precios. | OCR.space en servidor; borrador persistente con estado review; confirmación humana y guardado transaccional. |
| Los logs registraban errores del proveedor Gemini. | Se retiró esa dependencia del OCR conforme a la instrucción del grupo. Los logs no permiten atribuir todos los errores anteriores a una causa única. |
| Resultado OCR oculto mediante el atributo hidden y sin formulario de confirmación. | Se muestra una revisión editable; los datos externos se insertan como texto o valores de controles. |
| Guardar una clave aparentaba verificar el proveedor. | Configured permanece separado de verified. No se inventa una prueba de conexión. |
| Editar el modelo exigía introducir otra vez la clave y perdía metadatos. | La clave vacía conserva ciphertext e IV; el modelo guardado se recupera; borrar exige una acción explícita. |
| Suma de monedas y de documentos pendientes o fallidos. | Totales y series separados por moneda; los borradores no contribuyen a los importes. |
| Referencias mezclaban negocios y compras antiguas. | Última compra por producto, proveedor y moneda dentro de los últimos 30 días del negocio actual. |
| Una política que verificaba solo user_id podía aceptar relaciones con recursos ajenos. | Políticas restrictivas adicionales validan padres y negocio, manteniendo las políticas anteriores. |
| Doble clic o llamadas simultáneas podían gastar cuota o duplicar compras. | Reserva con bloqueo, límite de intentos, borrador reutilizable y confirmación idempotente. |

Las facturas antiguas se conservan tal como estaban. No se les inventan productos, importes o confirmaciones; pueden volver a procesarse usando su botón de OCR.

## OCR y datos

process-invoice versión 6 y manage-integration versión 2 están desplegadas y activas, con verify_jwt habilitado. El servidor también valida la identidad con Supabase Auth y consulta exclusivamente documentos del usuario y negocio autorizados. Sin sesión, ambos endpoints devolvieron HTTP 401.

OCR.space recibe un archivo privado por POST y devuelve texto. La aplicación usa el motor 2, valida tamaño, formato y firma del archivo, maneja timeout, errores de cuota y lectura parcial. Las reglas extraen solo lo reconocible; no son un LLM ni garantizan comprender todos los diseños de comprobantes.

El servidor obtiene la clave OCR del registro cifrado del usuario o, si no existe, del secreto de entorno OCR_SPACE_API_KEY. El formato AES-256-GCM anterior se conserva. La nueva opción ocrspace se agregó sin borrar los cuatro proveedores anteriores ni sus claves.

Al confirmar, confirm_invoice_data guarda proveedor, catálogo, líneas, factura e historial en una transacción con los permisos del usuario. Comprueba unidades, cantidades, importes, total y duplicados. Un error revierte toda la operación. Un segundo envío de la misma factura no añade filas.

Los precios comparables son costes finales por unidad: impuestos adicionales y descuentos generales se distribuyen proporcionalmente sobre las líneas. El mismo nombre, marca y unidad reutiliza el producto dentro del negocio; distintas presentaciones deben conservarse en el nombre. No hay cotizaciones públicas del mercado ni garantías de stock.

El plan Free de OCR.space consultado publica 25.000 solicitudes/mes, 500/día por IP, archivos de hasta 1 MB y PDF de hasta tres páginas: https://ocr.space/ocrapi. La aplicación es más conservadora: 900.000 bytes, 20 intentos por usuario y 200 globales cada 24 horas. Las cuotas del proveedor pueden cambiar.

## Pruebas y límites de la evidencia

- 54 pruebas automáticas de cálculos, cifrado, parser, adaptador, Auth, permisos del handler y comportamiento DOM. Los clientes de Supabase y Chart.js de estas pruebas son simulados.
- Comprobación de sintaxis de ocho archivos JavaScript y empaquetado de ambas funciones TypeScript con sus dependencias locales.
- Llamada real a OCR.space con la clave pública documentada de demostración y un comprobante ficticio: dos productos, total 118, sin lectura parcial y con revisión requerida. No se guardó esa clave en producción.
- supabase/tests/purchases-rls.sql pasó en la base real con dos identidades: aislamiento, rechazo de enlaces ajenos, bóveda inaccesible al cliente, confirmación, coste final, idempotencia, duplicados y rechazo sin datos parciales.
- supabase/tests/ocr-quotas.sql pasó en la base real: reserva, procesamiento simultáneo, caché y límite por usuario. Todos sus cambios se revirtieron.
- Migración aplicada y endpoints protegidos comprobados. No se ha ejecutado todavía el recorrido completo de OCR con la clave privada del grupo ni el login interactivo y correo real.
- Auth público responde: registro habilitado, confirmación de correo requerida y Google deshabilitado. No se cambió esta configuración por inferencia.

## Avisos del proyecto

La bóveda tiene RLS sin políticas de cliente y permisos revocados para anon/authenticated; el aviso informativo al respecto es coherente con su acceso exclusivo de servidor.

Sigue pendiente la protección de contraseñas filtradas: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. No se activó un plan de pago.

Se corrigieron los índices faltantes de las relaciones utilizadas. Persisten avisos anteriores por políticas permisivas duplicadas y un índice duplicado. No se eliminaron políticas o índices existentes para silenciarlos. Referencias: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies y https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index.

## Trabajo que todavía requiere configuración o ampliación

| Área | Pendiente |
| --- | --- |
| OCR del grupo | Introducir una clave gratuita válida y hacer la prueba completa desde la web. |
| Auth y correo | Probar registro, confirmación, recuperación y cierre de sesión con las cuentas del grupo; revisar sus URL permitidas. |
| Google Login | Crear cliente OAuth web, configurarlo en Supabase y comprobar el flujo. Es independiente del OCR. |
| Proveedores opcionales | Las configuraciones anteriores se conservan; no se afirma conexión verificada ni procesamiento con ellas. |
| Scraping | Los enlaces de búsqueda no son extracción real de precios. |
| Sheets y Drive | No conectados ni autorizados. |
| Excel y automatizaciones | No implementados. |
| Telegram | El proyecto actual utiliza interfaz web; no hay bot conectado. |
| Perfil, privacidad y términos | Se conserva lo existente; quedan ampliaciones del perfil y consentimiento versionado. No se declara cumplimiento legal certificado. |

La guía RUBRICA_Y_SUSTENTACION.md distingue la evidencia ejecutada de lo que cada integrante aún debe demostrar. No se garantiza una nota ni se presenta una simulación como una prueba real.
