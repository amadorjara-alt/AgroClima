# Accesos necesarios para terminar CompraSmart AI

## Qué se necesita y cómo entregarlo

| Servicio | Recurso concreto | Acceso necesario | Forma segura |
| --- | --- | --- | --- |
| GitHub | `amadorjara-alt/CompraSmart-AI` | Escritura habilitada y creación de rama remota comprobada. Ya no requiere una nueva invitación. | Cada integrante conserva su cuenta; no compartir contraseñas. Las correcciones se revisan en una rama y PR. |
| Supabase | Proyecto `CompraSmart-AI`, referencia `fledooqwmwrjufeihoqn` | Una cuenta conectada con permisos para revisar esquema, Auth, Storage, funciones, logs, RLS y desplegar los cambios autorizados. | Conectar la cuenta que accede al proyecto o dar membresía a la cuenta conectada del grupo. No enviar `service_role` ni contraseña. |
| OCR.space Free | Clave API del grupo | Una clave gratuita válida para procesar los comprobantes de prueba. | Solicitarla desde https://ocr.space/ocrapi y guardarla en el servidor cuando se configure la función. No publicarla en GitHub ni pegarla en el chat. |
| Google Cloud, para el extra de Google Login | Cliente OAuth de tipo Web application del grupo | Configurar identidad, callback, Client ID y Client Secret en Supabase. | El responsable inicia sesión mediante el flujo seguro y registra el Client Secret directamente en Supabase. No es una clave de Gemini. |

GitHub, Supabase y OCR.space corresponden al circuito principal. Google Cloud solo es necesario para demostrar el adicional de Google Login. No se necesita otra cuenta de hosting de pago para la web estática.

La clave publicable y la URL correctas de Supabase ya están en el código; no se solicita sustituirlas. La clave de cifrado `CREDENTIALS_ENCRYPTION_KEY` debe conservarse. No regenerarla como intento de arreglar el OCR: las claves guardadas podrían dejar de descifrarse.

## Qué reúne la rama de recuperación

- Correcciones de métricas, monedas, referencias y estados de credenciales.
- Conservación del cifrado y de las claves al editar metadatos.
- Recuperación del parser del OCR antiguo y adaptador para OCR.space.
- Extracción de líneas impresas con cantidades, unidades y precios; advertencias para corrección humana.
- Llamada a `signInWithOAuth` con Google, tratamiento de cancelación y comprobación de disponibilidad.
- Retorno del correo de registro al `login.html` del sitio donde se ejecuta la aplicación.
- Controles de acceso deshabilitados cuando el SDK no puede inicializarse y versión del SDK fijada.
- Guía de exposición y matriz de evidencia de la rúbrica.
- **37 pruebas locales aprobadas**, además de la lectura real aislada del comprobante ficticio mediante OCR.space ya documentada.

Las correcciones se reúnen en `codex/recuperacion-ocr-integraciones` para revisión en GitHub. No se da por terminado el circuito completo del proyecto ni por desplegadas las funciones de Supabase.

## Orden de cierre después de habilitar los accesos

1. Comparar otra vez la rama principal remota y conservar el respaldo de la versión y datos pertinentes.
2. Recuperar el código y los logs reales de `process-invoice`; revisar `manage-integration` desplegada y la existencia del secreto original de cifrado sin exponer sus valores.
3. Auditar el esquema, relaciones, políticas y bucket mediante `supabase/audit/read-only.sql`. Preparar cambios compatibles con los datos existentes.
4. Integrar OCR.space con lectura autorizada de archivos, clave de servidor, control de cuotas, borrador revisable y persistencia coordinada de compras y precios. Conservar los archivos y datos existentes.
5. Activar la configuración de registro y las URL de confirmación y recuperación para la URL final de GitHub Pages.
6. Si se incluye Google, configurar OAuth y realizar el recorrido completo con consentimiento del usuario.
7. Subir los cambios del grupo, ejecutar CI y comprobar la web publicada.
8. Probar con dos cuentas de aplicación y documentos ficticios: registro, login, recarga, OCR, corrección, guardado, comparación, gráficos, RLS y cierre de sesión.
9. Preparar evidencias y ensayar la sustentación individual. No asignar puntos de la rúbrica basándose solo en pruebas simuladas.

## Configuración de Google que se revisará

En Google Auth Platform, crear o usar un cliente **Web application**. El origen autorizado será el origen real de la web, sin su ruta. El redirect URI hacia Supabase debe ser:

`https://fledooqwmwrjufeihoqn.supabase.co/auth/v1/callback`

En Supabase Auth, activar Google e introducir el Client ID y el Client Secret. La lista de redirecciones debe permitir la URL final de `login.html`. También deben autorizarse las URL usadas para confirmación de registro y `reset-password.html`.

No confundir el callback de Google a Supabase con el retorno de Supabase a la web. La URL publicada de GitHub Pages se comprobará al disponer del acceso; no se declara publicada por deducir su nombre.

Solicitar únicamente identidad básica (`openid`, correo y perfil). No habilitar Sheets o Drive para obtener el punto de login. Si la aplicación OAuth permanece en modo de pruebas, se deben registrar los usuarios de prueba que corresponda según la configuración de Google.

## Qué pruebas requieren intervención del grupo

Para validar correo real, el responsable debe poder abrir su buzón y confirmar el registro. Para Google, debe elegir su cuenta y autorizar el acceso. Para RLS, hacen falta dos usuarios de prueba con registros diferentes; sus contraseñas se introducen mediante un flujo seguro o las crea cada integrante dentro de la aplicación.

No hacen falta contraseñas compartidas del profesor o de todos los compañeros. Tampoco se necesitan facturas reales de clientes para la exposición.

## Comprobación de las conexiones disponibles

La conexión de GitHub usa el perfil `RodolfoAaron`; después de la autorización del propietario se comprobó la creación de una rama en `amadorjara-alt/CompraSmart-AI`. En cambio, consultar `fledooqwmwrjufeihoqn` en Supabase aún devuelve un error de permisos. Debe invitarse a la cuenta propia del integrante a la organización correcta o conectarse una cuenta ya autorizada. No se puede dar por conectado el proyecto por haber instalado el complemento.
