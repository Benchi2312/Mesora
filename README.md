# Mesora 1.0

Mesora es una aplicación web para coordinar la operación diaria de un restaurante: mesas, pedidos, preparación por áreas, caja, cobros, personal y reportes internos.

- **Producción:** [mesora-sistema.vercel.app](https://mesora-sistema.vercel.app)
- **Demo sin cuenta ni escrituras en Supabase:** [mesora-sistema.vercel.app/demo](https://mesora-sistema.vercel.app/demo)
- **Versión:** 1.0.0, preparada para validación controlada con usuarios de prueba.

Mesora emite **recibos internos**. No emite boletas electrónicas ni reemplaza el sistema de facturación electrónica del restaurante.

## Funcionalidades principales

- Administración de zonas, mesas, menú, categorías, personal y configuración del restaurante.
- Comandas idempotentes con detalle y observaciones, distribuidas por área según la configuración del restaurante y las asignaciones históricas compatibles.
- Pantallas de trabajo para Cocina y, cuando está configurada, Barra; avances independientes por estación.
- Caja por turnos, métodos de pago disponibles, pagos divididos cuando corresponda, arqueo y cierre.
- Modalidad de cobro por restaurante con autorización validada en backend.
- Precuenta, recibo interno, anulación con motivo y conservación del historial.
- Traslado de consumo y cambio de responsable con confirmación y auditoría.
- Reportes de ventas, cuentas, productos, categorías y meseros, con filtros y exportación CSV.
- Auditoría de acciones sensibles, soporte entre restaurantes y Superadmin.
- Impresión manual desde el navegador e impresión automática opcional mediante agente local Windows.

## Roles

| Rol | Uso principal |
| --- | --- |
| `super_admin` | Administración global de restaurantes, suscripciones, usuarios de plataforma, soporte, notificaciones y auditoría. |
| `admin_restaurante` | Configuración y consulta de su restaurante, equipo, operación, caja, cobros, auditoría y reportes. |
| `mesero` | Mesas, pedidos, comandas y operaciones autorizadas sobre el consumo. El cobro depende de la modalidad y autorización vigentes. |
| `cajero` | Apertura y cierre de caja y cobros permitidos por la modalidad configurada. |
| `cocina` | Consulta y avance de las comandas asignadas a sus estaciones. No puede cobrar. |

Barra es una estación dentro de `/cocina`, no un rol o una ruta separada. Los usuarios inactivos no deben operar. El backend y RLS aplican los permisos y el aislamiento por restaurante; la interfaz no es el control de seguridad.

## Tecnologías

- React, TypeScript y Vite.
- Supabase: PostgreSQL, Auth, Realtime, RLS y funciones RPC.
- Playwright para verificaciones de navegador y responsive.
- Agente de impresión independiente en Node.js para computadoras Windows, opcional.

## Requisitos mínimos

- Node.js 22.x y npm.
- Navegador moderno actualizado (Chrome o Edge recomendado para impresión desde navegador).
- Conexión a Internet y un proyecto Supabase configurado para ejecutar Mesora con datos reales.
- Para impresión automática: computadora Windows vinculada y una impresora configurada. La validación física se describe en [Limitaciones conocidas](./docs/LIMITACIONES_CONOCIDAS.md).

## Instalación local

1. Clona el repositorio y entra a su carpeta.
2. Copia `.env.example` como `.env.local` sin subir este último archivo.

   En Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   En macOS o Linux:

   ```sh
   cp .env.example .env.local
   ```

3. Completa localmente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores públicos del entorno Supabase que tengas autorizado. No uses una clave `service_role` en Vite, en el navegador ni en el repositorio.
4. Instala dependencias e inicia la aplicación:

   ```sh
   npm ci
   npm run dev
   ```

5. Abre la URL local que indique Vite. Para usar el demo, visita `/demo`; funciona con datos de ejemplo y no escribe en Supabase.

El modo de datos local de QA se habilita explícitamente con `VITE_MESORA_MODO_LOCAL=true` durante desarrollo. No es un modo de producción ni sincroniza datos con Supabase. Si quieres trabajar solo con el demo, no necesitas credenciales.

## Configuración y datos

`.env.example` es una plantilla; sus valores de ejemplo no son credenciales. Los archivos `.env.local` y secretos del servidor permanecen fuera de Git. Las variables `VITE_*` se incorporan al bundle del navegador, por lo que solo deben contener configuración pública.

En una instalación nueva, revisa el instalador generado y la guía técnica de Supabase antes de aplicarlos. En una base existente, inspecciona el historial y aplica únicamente las migraciones pendientes, en orden y con un respaldo verificado. **No uses el instalador de base limpia para actualizar una base existente.** Esta documentación no autoriza ni ejecuta cambios remotos.

## Verificación local

```sh
npm run typecheck
npm run build
npm run verificar
npm run verificar:responsive
npm run verificar:sql
git diff --check
```

Comprobaciones adicionales disponibles:

```sh
npm run verificar:precuenta
npm run verificar:configuracion
npm run verificar:enrutamiento
npm run verificar:impresion
npm run verificar:agente
npm run verificar:chunks
npm run verificar:acceso
npm run verificar:despliegue -- https://mesora-sistema.vercel.app
```

Las suites automatizadas usan datos simulados o una base PostgreSQL aislada. No sustituyen el ensayo con personal del restaurante, la validación de permisos con cuentas de prueba ni la impresión física.

## Despliegue

La aplicación web se construye con `npm run build` y genera `dist/`. En Vercel, configura las variables públicas requeridas desde el panel del entorno, nunca en el repositorio; confirma que el comando de build y el rewrite de SPA estén activos. Para publicar, usa una rama y un Pull Request, espera CI verde, integra a `main`, verifica el deployment `READY` y revisa el dominio de producción con:

```sh
npm run verificar:despliegue -- https://mesora-sistema.vercel.app
```

Los cambios de esquema Supabase son un paso separado y coordinado: respaldo, revisión de migraciones pendientes, ventana de mantenimiento cuando corresponda y QA posterior. No despliegues frontend que dependa de un esquema que todavía no está aplicado.

## Documentación v1.0

- [Manual de usuario](./docs/MANUAL_USUARIO_V1.md)
- [Roles y permisos](./docs/ROLES_Y_PERMISOS.md)
- [Requisitos funcionales](./docs/REQUISITOS_FUNCIONALES.md)
- [Requisitos no funcionales](./docs/REQUISITOS_NO_FUNCIONALES.md)
- [Flujos del sistema](./docs/FLUJOS_DEL_SISTEMA.md)
- [Guía de prueba piloto](./docs/GUIA_DE_PRUEBA_PILOTO.md)
- [Limitaciones conocidas](./docs/LIMITACIONES_CONOCIDAS.md)
- [Changelog](./docs/CHANGELOG.md)
- [Operación de comandas e impresión](./docs/OPERACION_COMANDAS.md)
- [Agente local Windows](./docs/AGENTE_IMPRESION_WINDOWS.md)
