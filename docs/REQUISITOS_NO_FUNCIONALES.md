# Requisitos no funcionales — Mesora 1.0

## Seguridad y privacidad

- La autenticación real usa Supabase Auth.
- La autorización se verifica en interfaz y backend; RLS restringe el acceso al restaurante correspondiente.
- Las RPC de operaciones críticas validan rol, estado del usuario y pertenencia de los datos.
- Los secretos de servidor permanecen en el entorno servidor. Las variables `VITE_*` se consideran públicas porque terminan en el navegador.
- No registrar contraseñas, PIN, tokens, claves privadas ni contenido sensible en logs o capturas.
- Auditoría conserva trazabilidad sin borrar los registros originales por una anulación.

## Integridad y disponibilidad

- Las operaciones que afectan varios registros deben ser atómicas en la base de datos.
- La creación de comandas y otras operaciones soportadas usan idempotencia o reconciliación para que una respuesta perdida no provoque duplicados.
- Si no se puede determinar el resultado, la interfaz debe comunicar incertidumbre y no invitar a repetir una escritura a ciegas.
- El modo demo y QA local son aislados y no sustituyen una instalación real.
- La operación real requiere conectividad con el servicio Supabase; no se ofrece sincronización offline de pedidos o pagos.

## Compatibilidad

- Cliente web: navegadores modernos; Chrome o Edge recomendados en los equipos que usan diálogo de impresión.
- Desarrollo: Node.js 22.x y npm, conforme a `package.json`.
- Impresión automática: computadora Windows vinculada, agente instalado/ejecutándose e impresora configurada.
- La aplicación web es responsive para escritorio, tablet y móvil.

## Accesibilidad y uso

- Navegación por teclado y foco visible en controles relevantes.
- Texto legible, contraste conservado y controles táctiles adecuados en vistas operativas.
- Estados de carga, error, vacío y confirmación deben ofrecer contexto y permitir recuperación cuando corresponda.
- Las confirmaciones de acciones sensibles deben resumir qué se cambiará y conservar el motivo cuando aplique.

## Mantenibilidad y despliegue

- TypeScript y build de producción detectan errores de tipos y empaquetado.
- Las reglas de negocio se verifican mediante suites locales, SQL QA y pruebas de navegador.
- Las migraciones versionadas deben revisarse y aplicarse en orden; un frontend y esquema compatibles se publican de forma coordinada.
- Backups, archivos `.env`, secretos y datos reales nunca se incorporan al repositorio.
- La publicación web no certifica el estado físico de una impresora ni la disponibilidad continua del proveedor.

## Requisitos mínimos de operación

| Recurso | Mínimo práctico |
| --- | --- |
| Equipo de desarrollo | Sistema capaz de ejecutar Node.js 22.x y npm. |
| Navegador | Versión moderna de Chrome, Edge, Firefox o Safari; usar Chrome/Edge para el flujo de impresión manual. |
| Red | Acceso HTTPS al frontend y conectividad con Supabase en modo real. |
| Impresión manual | Navegador y sistema operativo con impresora seleccionable. |
| Impresión automática | PC Windows, agente vinculado, conexión a Mesora y cola/impresora configurada. |
