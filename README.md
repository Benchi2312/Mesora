# Mesora

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/marca/kit-mesora/logo-oscuro.svg">
  <img src="docs/marca/kit-mesora/logo-claro.svg" alt="Mesora" width="300">
</picture>

### El servicio del restaurante, coordinado en un solo lugar.

Mesas, pedidos, cocina, caja y ventas conectados en una sola aplicación. Mesora
ayuda a que el equipo sepa qué pidió cada mesa, qué debe preparar cocina, qué
está cobrando caja y cómo se movieron las ventas, sin depender de notas sueltas
o información dispersa entre varias personas.

[🌐 Conocer Mesora](https://mesora-sistema.vercel.app) ·
[▶ Probar el demo interactivo](https://mesora-sistema.vercel.app/demo)

Consultas comerciales: [mesoratech@gmail.com](mailto:mesoratech@gmail.com).

Documentación: [estado y pendientes del MVP](./docs/ESTADO_MVP.md) ·
[guía del primer turno](./docs/GUIA_PRIMER_TURNO.md) ·
[operación y contingencias](./docs/OPERACION_PILOTO.md) ·
[datos de contacto y soporte](./docs/DATOS_CONTACTO_SOPORTE.md) ·
[propuesta de retención de datos](./docs/PROPUESTA_RETENCION_DATOS.md) ·
[situación de licencia](./docs/LICENCIA_REPOSITORIO.md) ·
[identidad visual](./docs/marca/README.md).

El demo es gratuito, no requiere cuenta y usa datos de ejemplo. Puedes recorrer
los roles de administración, mesero, cocina y caja, probar el flujo guiado
**«Hazlo por mí»** y reiniciarlo cuando quieras. Las acciones del demo no
registran ventas reales ni modifican la base de datos del restaurante.

## ¿Qué problema resuelve?

En un turno, los pedidos pueden quedar repartidos entre conversaciones, papel
y memoria: se pierde contexto de la mesa, cocina no siempre ve los cambios a
tiempo y luego cuesta reconstruir qué se consumió, cobró o vendió. Mesora reúne
ese recorrido para que cada rol trabaje con la misma información.

- **Salón:** organiza zonas y mesas, registra pedidos y permite consultar el
  consumo de cada cuenta.
- **Cocina:** recibe comandas y actualiza su avance para que el equipo de salón
  pueda seguir el estado.
- **Caja:** reúne cobros, pagos y turnos; facilita el arqueo y el cierre de
  caja.
- **Administración:** ofrece reportes para revisar ventas, productos y bebidas,
  mesas, cuentas y desempeño del equipo.

Mesora organiza la operación diaria y los reportes internos. La emisión fiscal
de comprobantes electrónicos continúa en el sistema de facturación que use el
restaurante.

## Prueba rápida

1. Abre [mesora-sistema.vercel.app/demo](https://mesora-sistema.vercel.app/demo).
2. Sigue **«Hazlo por mí»** para ver un ejemplo paso a paso, o elige una vista:
   administración, mesero, cocina o caja.
3. Explora una mesa, revisa una comanda y mira cómo se presenta la información
   al equipo.
4. Usa **«Vaciar el demo»** para reiniciar los datos de ejemplo.

## Sobre este proyecto

Mesora es una aplicación web para restaurantes con modos demo, QA local y
conexión a Supabase. Comparte reglas de negocio entre adaptadores y protege los
datos operativos mediante autenticación, permisos y políticas de base de datos.
Las instrucciones de instalación, arquitectura y verificación están más abajo.

## Stack

- React 19 + TypeScript + Vite
- Sin framework de UI: los componentes viven en `src/components/ui.tsx`
- Supabase (Postgres + Auth + Realtime) como backend real
- RLS en todas las tablas; las operaciones atómicas van por RPC (`security definer`)
- `localStorage` para el modo local, con botón de reset en `/login`

## Roles

| Rol | Puede |
| --- | --- |
| `mesero` | ver mesas, tomar comandas, editar/anular ítems, cobrar |
| `cocina` | ver y avanzar comandas (pendiente → en preparación → listo) |
| `cajero` | abrir/cerrar turno de caja, cobrar mesas y ver el arqueo |
| `admin_restaurante` | todo lo anterior + dashboard, zonas, mesas, menú, personal y reportes |
| `super_admin` | restaurantes, suscripciones, tickets de soporte, consultas comerciales, auditoría y configuración global |

El rol se lee de la tabla `usuarios` (`usuarios.id` = `auth.users.id`), no del
frontend, y un restaurante con `suscripcion_activa = false` o
`fecha_vencimiento` vencida bloquea el acceso (salvo `super_admin`).
El bloqueo pausa a todos los roles del restaurante sin cambiar permanentemente
`usuarios.activo`; al renovar, sus sesiones pueden volver a operar. El panel
del administrador muestra la fecha y el tiempo restante, con avisos visibles
durante los últimos 30 días y prioridad creciente en los últimos 7 días y
24 horas. Las sesiones abiertas vuelven a consultar el estado cada minuto y
al recuperar el foco de la ventana.

## Modos de ejecución

1. **Local** (solo QA opt-in): login y roles sobre un dataset simulado,
   habilitado manualmente con `VITE_MESORA_MODO_LOCAL=true` en desarrollo.
2. **Demo** (`/demo`): las 4 vistas con datos de ejemplo, sin login, con el
   recorrido guiado "Hazlo por mí" y persistencia en `localStorage` (el botón
   *Vaciar el demo* lo reinicia). No toca Supabase.
3. **Supabase**: define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (ver [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)).

Los tres usan el mismo `src/lib/api.ts`; solo cambia la implementación que
devuelve `getApi()` (`realApi`, `localApi` o `mockApi`).

## Instalación

```bash
npm install
cp .env.example .env.local   # completa URL y anon key de Supabase
npm run dev
```

El backend simulado no se activa automáticamente. Para QA local, define
`VITE_MESORA_MODO_LOCAL=true` en `.env.local`; nunca se habilita en producción.
Si falta Supabase y el modo QA no está habilitado, el login muestra un error de
configuración y no acepta credenciales locales.

Para crear el proyecto, aplicar el SQL y los usuarios:
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

## Scripts

```bash
npm run dev                  # vite
npm run build                # tsc && vite build
npm run preview              # sirve dist/
npm run typecheck            # tsc --noEmit
npm run verificar            # 510 checks de reglas de negocio (backend local)
npm run verificar:precuenta  # QA de precuenta, impresión/PDF y ausencia de escrituras
npm run verificar:configuracion # QA del guardado de Datos del local, REST y dominio
npm run verificar:sql        # PostgreSQL aislado: instalación, permisos, flujo y restauración
npm run verificar:responsive # QA responsive del sistema y la landing
npm run verificar:despliegue -- https://mesora-sistema.vercel.app # rutas públicas, sin ventas reales
npm run verificar:acceso      # cuentas desactivadas, salida y contraseña temporal con Auth simulado
npm run capturas:demo        # capturas del recorrido guiado (Playwright)
npm run sql:install          # regenera supabase/TODO_EN_UNO.sql
```

## Verificar que nada se rompió

```bash
npm run typecheck
npm run sql:install
npm run verificar:sql
npm run verificar
npm run verificar:precuenta
npm run verificar:configuracion
npm run verificar:responsive
npm run build
```

`npm run verificar` no necesita navegador ni Supabase: levanta Vite y ejercita
`src/lib/api.ts` y `src/lib/localSeed.ts` con los mismos módulos que usa la app,
sobre un `localStorage` en memoria. Cubre dos comandas en la misma mesa, el
cierre de cuenta (total, subtotales por pedido, mesa liberada, cocina limpia), el
rechazo del cobro doble, la whitelist de métodos de pago, la separación
cocina/barra por `es_bebida`, la edición y anulación de ítems, las métricas del
dashboard, la caja por turnos y el round-trip de `localStorage` simulando un F5.

`npm run verificar:responsive` usa Playwright con Chromium: recorre landing,
login, demo, las 8 pestañas del admin, mesero, cocina, cajero y las 10 secciones
del super admin con datos, en 360, 390, 768 y 1280 px. Además revisa la landing
en 16 anchos de 320 a 1920 px, incluidos los cambios de diseño y 820 px.
Comprueba desbordes, enlaces y botones superpuestos, controles táctiles, el
menú adaptable y el flujo guiado de categoría/producto.
Usa un directorio de entorno temporal para forzar el modo QA sin mover
`.env.local` ni alterar servidores Vite que ya estén abiertos.

Ambas suites salen con código 1 si algún check falla.

`npm run verificar:sql` instala el SQL en PostgreSQL aislado (PGlite con
pgcrypto), verifica permisos y recorre apertura, pedido, cocina, pago dividido,
anulación con PIN y arqueo. También comprueba 1205 pedidos sin truncamiento y
la restauración de esa base de prueba. No conecta a Supabase; Auth se simula.
No sustituye login real, correo, impresora física ni pruebas entre dos dispositivos.

## Interfaz y experiencia móvil

La interfaz usa una paleta oscura con acentos naranja para conservar el mismo
lenguaje visual en administración, caja, cocina y atención. Los paneles se
adaptan a escritorio, tablet y móvil; en pantallas pequeñas, las tablas se
desplazan dentro de su contenedor y la guía del demo limita su altura para dejar
visible parte de la vista que explica. `npm run verificar:responsive` comprueba
las rutas y controles táctiles en los anchos indicados arriba.

## Desplegar en Vercel

El proyecto `mesora` está conectado al repositorio de Mesora,
`Benchi2312/Mesora`, con `main` como rama de producción y dirección
**https://mesora-sistema.vercel.app**. Node 22, `npm ci`, `npm run build` y salida
`dist` están definidos; el rewrite SPA permite recargar las rutas internas.

**Promoción del dominio:** Vercel mantiene el despliegue preparado mientras la
comprobación `CI de Mesora` de GitHub está pendiente. Cuando CI aprobó el commit
`f711384`, Vercel lo promocionó automáticamente a `mesora-sistema.vercel.app`.
Verificar tanto la CI como la promoción antes de dar por publicado un cambio.

Flujo de cambios:

1. Crear `respaldo/<tema>`, hacer los cambios, subir la rama y abrir PR hacia `main`.
2. Esperar la CI de reglas de negocio, SQL, TypeScript, precuenta, configuración
   y build. Las ramas de trabajo no publican automáticamente (`vercel.json`).
3. Integrar el PR. El push a `main` dispara el despliegue de producción desde
   la integración Git de Vercel. CI y despliegue se ejecutan por separado; revisar
   ambos resultados. Si el build falla después de publicar, revertir desde Vercel
   o corregir `main`; no hay rollback automático por el resultado de CI.
4. El evento de despliegue exitoso ejecuta `Verificar despliegue` en GitHub:
   13 rutas, recursos, redirección de páginas privadas e independencia del demo.
   También se puede ejecutar manualmente desde Actions. Esta prueba detecta
   fallos después de publicar; no revierte automáticamente el despliegue.
5. GitHub elimina la rama del PR al integrarlo. Sincronizar `main` y limpiar las
   ramas locales ya integradas con `git branch -d <rama>`.

Variables en Production y Preview: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (clave pública), `VITE_MESORA_MODO_LOCAL=false` y
`VITE_MESORA_DIAGNOSTICO=true`. `VITE_MESORA_CONTACTO_EMAIL` define el correo
público de la landing. El contacto comercial actual es
[`mesoratech@gmail.com`](mailto:mesoratech@gmail.com) y está configurado para
Production y Preview.
No usar `service_role` en el frontend. Tras cambiar variables, reconstruir:
Vite las incrusta durante el build.

En Supabase, Site URL debe coincidir con el dominio publicado y Redirect URLs
debe incluir `https://mesora-sistema.vercel.app/restablecer`.
Supabase Auth usa SMTP personalizado con el remitente `Mesora Tech` para los
enlaces enviados al correo de acceso. El superadministrador y el administrador
de restaurante completaron la recuperación de su contraseña y el ingreso,
según confirmó el propietario. La plantilla de recuperación está en
`supabase/templates/recuperar-contrasena.html`.

El correo alternativo verificado del administrador es un circuito adicional:
requiere `RESEND_API_KEY`, `MESORA_AUTH_FROM_EMAIL` y `MESORA_SITE_URL` en los
secretos de Supabase Functions, un remitente admitido y una prueba real. El
personal sigue dependiendo del restablecimiento iniciado desde **Personal**.
Consultar [operación del piloto](./docs/OPERACION_PILOTO.md) para respaldo,
aceptación del local y reversión. El despliegue web no certifica esas pruebas.

## Estructura

```
src/
  components/ui.tsx        primitives compartidas (botón, modal, input, chip, tabla...)
  domain/                   lógica de negocio agrupada por dominio
    security/                roles, autorización, identidad y contraseñas
    cashier/                 pagos, caja y boletas
    restaurant/              configuración y suscripciones del restaurante
    reporting/               métricas y reportes de ventas
    platform/                auditoría, usuarios, notificaciones y soporte
  lib/
    api.ts                 fachada de datos (Supabase, QA local y demo)
    localSeed.ts           dataset simulado del modo local
    mockData.ts            dataset aislado del demo
    format.ts              formato de moneda, fechas y estados
    supabase.ts            cliente y configuración de Supabase
    diagnostico.ts         categorías de errores sin mensajes ni credenciales
  pages/
    landing/  Login/  mesero/  cocina/  admin/  cajero/  superadmin/
  demo/                    recorrido guiado y datos del modo demo
  types/database.ts        tipos del schema (roles, estados, filas, funciones RPC)
supabase/
  TODO_EN_UNO.sql          instalador único (generado, es el que se pega)
  fuentes/                 19 archivos fuente en orden de aplicación
  migrations/              migraciones versionadas para actualizaciones acotadas
  qa/                      pruebas SQL con rollback; no se instalan en producción
scripts/
  verificar-flujo.mjs      suite de reglas de negocio (510 checks)
  verificar-configuracion.mjs guardado, errores y dominio del local
  verificar-precuenta.mjs  vista, PDF, impresión y consumo actualizado
  verificar-sql.mjs        instalación y circuito SQL en PostgreSQL aislado
  verificar-responsive.mjs suite responsive, navegación y guía móvil
  capturas-demo.mjs        capturas del recorrido guiado
  build-install-sql.mjs    genera TODO_EN_UNO.sql
```

## Precuenta antes del cobro

Desde una mesa abierta o la pantalla de cierre, pulsa **Ver precuenta**.
En **Caja**, administrador y cajero pueden abrirla desde **Precuentas**.
Incluye el consumo pendiente de todas las comandas de la mesa, excluye los
ítems anulados y permite imprimir o descargar PDF. No registra una venta,
no asigna número de boleta ni libera la mesa. La propina no está incluida.

Usa **Actualizar precuenta** si se agregaron o corrigieron pedidos. El documento
identifica el consumo pendiente y la fecha de emisión; no es un comprobante de
pago. El adaptador real utiliza las RPC de pendientes de la migración
`20261030173320_consultas_pendientes_piloto.sql`, que debe aplicarse antes de
desplegar este frontend en otra instalación.

Al cobrar, el documento de Mesora se identifica como **recibo interno de pago**.
No integra emisión fiscal ni sustituye el comprobante electrónico del local.

El análisis actualizado de bloqueos, aceptación y operación del primer piloto
está en [docs/PILOTO.md](./docs/PILOTO.md). El procedimiento de respaldo,
contingencia, primer turno y reversión está en
[docs/OPERACION_PILOTO.md](./docs/OPERACION_PILOTO.md).

El dominio del personal requiere la migración
[`20261029052901_datos_local_dominio.sql`](./supabase/migrations/20261029052901_datos_local_dominio.sql).
Esta agrega la columna opcional y su permiso de actualización, conservando RLS.
En la base Mesora revisada ya se aplicó. Cambiar el dominio afecta la creación
de nuevos accesos; no renombra las cuentas existentes.

## Base de datos

Todo el SQL se instala de una vez: `supabase/TODO_EN_UNO.sql`. Se genera desde
`supabase/fuentes/` y `supabase/migrations/` con orden fijo (schema → requisitos
→ RPC → RLS → módulos de Super Admin → actualizaciones del piloto). Reservado
para una base nueva. Instrucciones completas en
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

RPC atómicas principales (todas `security definer` y con `EXECUTE` revocado a
`anon`):

- `crear_pedido(restaurante_id, mesa_id, items)` — inserta pedido + ítems y
  ocupa la mesa en una transacción. **El precio y el nombre los resuelve
  Postgres** leyendo `productos` con `for update`; el cliente solo manda
  `producto_id`, `cantidad` y `nota`, así que un precio manipulado no cuela.
- `editar_item_comanda(...)` y `anular_item_comanda(...)` — corrigen o anulan un
  ítem de una comanda aún no cobrada; el precio unitario queda congelado y el
  ítem anulado se conserva para auditoría.
- `cerrar_cuenta(restaurante_id, mesa_id, pagos[], propina, ...)` — inserta la
  cuenta pagada, los pagos parciales, enlaza `cuenta_pedidos` con el subtotal de
  cada pedido, asigna la boleta con `correlativos`, cierra los pedidos y libera
  la mesa. Rechaza métodos fuera de la whitelist y pedidos ya cobrados.
- `anular_cuenta(...)`, `abrir_turno_caja(...)`, `cerrar_turno_caja(...)` — con
  autorización por PIN las primeras, y arqueo por turno las de caja.
- `admin_alertas()`, `suscripciones_*` — panel de super admin.

Los permisos están endurecidos en `01_rls_completo.sql` y en cada módulo:
`anon` no puede leer las tablas del dominio, `truncate` está revocado, y
`configuracion_global` concede a `anon` solo las columnas que pinta la landing.

## Reglas de negocio

- **Varias comandas por mesa**: una mesa ocupada puede recibir más pedidos; se
  acumulan y se cobran juntos en un solo cierre de cuenta.
- **Un pedido está cobrado** si está enlazado en `cuenta_pedidos` a una cuenta
  con `estado = 'pagada'`. No se filtran los pedidos con `estado = 'entregado'`:
  ese estado también lo usa cocina para un pedido ya servido pero **pendiente de
  cobro**, y filtrar por él perdería dinero.
- **Cierre de cuenta**: valida que los pedidos pertenezcan a esa mesa y a ese
  restaurante, rechaza si alguno ya fue cobrado, guarda un `subtotal` por pedido
  y marca todos como `entregado` liberando la mesa. Los ítems anulados no suman
  y una comanda que suma cero no se cobra.
- **Editar un ítem**: solo `cantidad` (1 a 99) y `nota`, y solo mientras la comanda
  no esté cobrada ni anulada. El `precio_unitario` queda congelado al pedir:
  nadie lo cambia desde la comanda.
- **Anular un ítem**: no se borra, se marca `anulado` (con `anulado_por` y
  `anulado_at`), así queda rastro de qué se pidió y qué se canceló. Deja de sumar,
  sale de la boleta y sale de la cola de cocina — donde sí aparece marcado como
  "anulado por el mesero" para que nadie lo cocine por error. Es idempotente.
- **Comanda anulada**: cuando una comanda se queda sin ítems vigentes su `estado`
  pasa a `'anulado'` (no se prepara, no se cobra) y la mesa vuelve a `'libre'` si
  no le quedan comandas por cobrar.
- **Métodos de pago**: solo `efectivo`, `tarjeta`, `yape_plin`, `otro`
  (`METODOS_PAGO` en `src/types/database.ts`, etiquetas en `src/lib/pagos.ts`).
- **Cocina vs Barra**: lo decide `productos.es_bebida` (flag explícito del
  Admin), no el nombre de la categoría. Los datos guardados antes de existir el
  campo se normalizan una sola vez al cargar, inferyéndolo de la categoría
  "Bebidas".

## Schema de Supabase

El instalador generado, supabase/TODO_EN_UNO.sql, es para proyectos nuevos.
En un proyecto existente se aplican solo migraciones revisadas en el orden
indicado en SUPABASE_SETUP.md; no se vuelve a pegar el instalador completo.
El orden de fuentes y su cobertura se verifican con npm run sql:install.
## Estado actual

Implementado. Última verificación registrada (`npm run verificar`: 510 checks;
`npm run verificar:responsive`: sistema en 4 viewports y landing en 16 anchos):

- Auth (email/password), lectura de rol desde `usuarios`, rutas protegidas por rol y bloqueo por suscripción vencida.
- **Vista Mesero**: grilla de mesas por zona, toma de pedido desde el menú (categorías, promociones, notas por ítem), envío de comanda atómica (`crear_pedido`), **varias comandas por mesa** con pantalla intermedia que acumula el total, y cierre de cuenta con método de pago, pago dividido, propina y boleta imprimible (`cerrar_cuenta`), con **edición y anulación de ítems** desde la comanda abierta.
- **Vista Cocina**: comandas en columnas por estado (pendientes / en preparación / listos) con cronómetro de espera, avance de estado y separación cocina/barra por `es_bebida`. Cada dispositivo puede activar un aviso sonoro para nuevas comandas pendientes; la primera carga es silenciosa y el navegador requiere activar audio desde la pantalla.
- **Vista Admin**: dashboard de ventas (hoy/mes, ticket promedio, top productos, ventas por mesero, métodos de pago y horarios pico) y sección **Ventas** con filtros por periodo/estado, detalle de consumo por cuenta, pagos divididos, anulaciones, ranking de productos/bebidas, meseros y mesas. Es un reporte interno: la facturación electrónica continúa en el sistema fiscal del restaurante. También incluye **Caja por turnos** con arqueo y aviso (no bloqueo) de mesas sin cobrar, **Cobros** con anulación y PIN, gestión de zonas, mesas, categorías y productos, personal y datos del local. Export CSV y reportes imprimibles.
- **Vista Super Admin**: restaurantes, administradores, usuarios, suscripciones, estadísticas, auditoría, notificaciones, soporte de restaurantes, consultas comerciales y configuración global. Los avisos de tickets, contactos e incidencias se envían al correo comercial mediante una cola con reintentos.
- **Modo local** (solo desarrollo, activación explícita con VITE_MESORA_MODO_LOCAL=true): login y roles simulados sobre un dataset de prueba, persistencia en localStorage y botón de reset en /login. Sin esa variable, la app falla cerrada si Supabase no está configurado.
- **Modo demo** (`/demo`): las 4 vistas sin login, con recorrido guiado que escribe por ti ("Hazlo por mí"), persistencia en `localStorage` y botón para vaciarlo.
- **Rendimiento**: code-splitting por ruta; la landing y el login no descargan el panel.
- **Instalador generado**: `supabase/TODO_EN_UNO.sql` (30 piezas SQL ordenadas, 19 tablas operativas con RLS y grants). Instalación vacía, restauración aislada, políticas, recuperación y controles de acceso verificados con `npm run verificar:sql`.
- **Seguridad del piloto**: funciones de negocio sin EXECUTE anónimo, search_path fijo, registro público desactivado y contraseña mínima de ocho caracteres en el proyecto revisado.
- **Revisión RLS (2 nov 2026)**: la migración aplicada limita la configuración global al superadmin y deja públicos solo el precio y el contacto que muestra la landing; también separa políticas de catálogo/mesas. Ver [informe de seguridad](./docs/REVISION_SEGURIDAD_SUPABASE.md).
- **Diagnóstico**: categorías de API/render/JavaScript/promesas en logs PostgreSQL, sin mensajes originales, PIN ni tokens. Requiere sesión; límite por pestaña de 20 intentos/10 minutos y deduplicación de 60 segundos. Desactivar con `VITE_MESORA_DIAGNOSTICO=false` y reconstruir. Los fallos de funciones y correo generan incidentes resumidos en Notificaciones del superadministrador; requieren abrir el panel, sin aviso externo automático.

Todo el acceso a datos pasa por `getApi()` (capa real/local/mock), por lo que las
vistas funcionan igual en los tres modos. Las reglas de negocio están
centralizadas para que `localApi`, `mockApi` y las RPC de Postgres se comporten
de forma coherente; las suites locales y SQL cubren los circuitos principales.

### Pendiente para el primer turno piloto

- Copiar el dump ya restaurado en PostgreSQL aislado a almacenamiento cifrado fuera de esta computadora y definir responsable, frecuencia y retención. Añadir cobertura separada para Storage y configuración/secrets de proveedores.
- Completar la aceptación punta a punta en el local con cuentas de prueba: cuentas por
  rol, pedidos y cocina, cobros/anulación con PIN, arqueo, impresora y dos
  dispositivos. La batería local no sustituye la aceptación presencial; por decisión del propietario no se creó staging de pago.
- El propietario confirmó la recuperación por correo de las cuentas superadmin
  y admin de restaurante, y la recepción del formulario comercial. La prueba de
  conversación de soporte entre restaurante y superadmin sigue pendiente con
  cuentas reales. El correo alternativo es un flujo aparte. Ver
  [contacto](./docs/CONTACTO_COMERCIAL.md).
- Acordar responsable, monitoreo y operación ante cortes de red.
- Actualizar el video promocional con capturas de esta versión después de la aceptación del primer turno.
- Consultar el nombre y el símbolo en los registros oficiales antes de ampliar
  la promoción; ver la [revisión preliminar de marca](./docs/marca/REVISION_PRELIMINAR_NOMBRE.md).
## Integración continua

GitHub Actions ejecuta `npm ci`, `npm run sql:install`, `npm run verificar:sql`, `npm run verificar`,
`npm run typecheck`, `npm run verificar:precuenta`,
`npm run verificar:configuracion`, `npm run verificar:responsive`, comprobación
de tipos de la Edge Function y `npm run build` al abrir un pull request o actualizar
`main`/`master`. Para que se active, Mesora debe ser
la raíz del repositorio GitHub.

Mesora requiere `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para el acceso
real. Si faltan, el login falla cerrado; el backend simulado requiere activación
manual en desarrollo y `/demo` permanece público.

## Flujo de ramas

`main` es la rama estable. Para cada cambio, crea una rama `respaldo/<tema>`,
sube el trabajo, revisa que CI y la aceptación correspondiente pasen, integra a
`main` y elimina la rama de respaldo después de confirmar la integración. No
incluyas `.env.local`, credenciales ni datos reales en commits.
