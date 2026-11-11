# Estructura del repositorio

Las páginas HTML de AgroClima permanecen en la raíz porque GitHub Pages publica directamente desde esa carpeta. Sus rutas relativas (`css/`, `js/` y `assets/`) también se mantienen estables.

```text
.
├── index.html, login.html, register.html, dashboard.html
├── integrations.html, guia.html, legal.html, reset-password.html
├── assets/                  Marca e imágenes locales
├── css/                     Estilos del sitio
├── js/                      Cliente Supabase y módulos del sitio
├── docs/                    Rúbrica, arquitectura, datos y entrega
├── supabase/
│   ├── functions/           Funciones Edge
│   ├── migrations/          Cambios reproducibles de base de datos
│   └── tests/               Consultas de verificación de políticas
├── scripts/                 Herramientas de mantenimiento
├── tests/                   Suite automatizada del repositorio
├── archive/                 Prototipo y archivos históricos, fuera del sitio activo
└── .github/workflows/       Automatización del repositorio
```

`archive/prototype/` conserva la copia de desarrollo anterior; `archive/legacy-business/audit/` conserva un registro histórico del sistema previo. Ninguno forma parte de la aplicación que publica GitHub Pages.

Los archivos temporales de Supabase CLI están excluidos por `.gitignore`. No deben versionarse: se generan localmente al enlazar y administrar el proyecto.

Los módulos `js/agro-*`, `js/guia.js` y `js/supabase.js` forman el sitio activo. Los módulos anteriores del negocio se conservan por compatibilidad con el material histórico y no se cargan desde las páginas activas.
