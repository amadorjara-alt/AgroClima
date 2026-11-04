# CompraSmart AI

Aplicación del grupo para gestión de compras y comprobantes. Se conserva el frontend existente y el proyecto Supabase `fledooqwmwrjufeihoqn`.

La auditoría, cambios preparados, pruebas ejecutadas y funciones pendientes están en [docs/AUDITORIA_Y_RECUPERACION.md](docs/AUDITORIA_Y_RECUPERACION.md). La rama `codex/recuperacion-ocr-integraciones` reúne las correcciones para revisión. El acceso de escritura a GitHub está habilitado; el acceso al proyecto Supabase continúa pendiente. Subir el código no despliega las funciones ni activa OAuth.

## Pruebas de desarrollo

```sh
npm ci
npm test
npm run check
```

El frontend mantiene su funcionamiento con archivos estáticos. Node se utiliza para desarrollar y probar, no añade un servidor de pago a la aplicación. Las dependencias de prueba no se cargan en el navegador.

El adaptador de OCR.space está en `supabase/functions/_shared/ocr-space.mjs`; su prueba manual está en `scripts/probe-ocr.mjs`. Falta acoplarlo a la versión real desplegada de `process-invoice`, una vez recuperada y comparada con los permisos adecuados. No se utiliza Google ni Gemini en ese adaptador.

Las credenciales privadas se conservan en el servidor. No publicar claves de proveedores, tokens, contraseñas ni el secreto de cifrado. El archivo de configuración pública existente no se reemplaza.

## Rúbrica y presentación

La preparación académica está en [docs/RUBRICA_Y_SUSTENTACION.md](docs/RUBRICA_Y_SUSTENTACION.md), con los cinco criterios, extras, diagrama, recorrido de datos, demostración y preguntas de sustentación. Los accesos y verificaciones que faltan están en [docs/ACCESOS_Y_CIERRE.md](docs/ACCESOS_Y_CIERRE.md).
