# Mesora

Sistema de gestión para restaurantes: mesas, comandas, cocina, caja y reportes.
Una app web (SPA) que funciona en tres modos — **local** con datos simulados,
**demo** y **Supabase** real — y en los tres aplica exactamente las mismas
reglas de negocio.

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
| `super_admin` | restaurantes, suscripciones, soporte, auditoría y configuración global |

El rol se lee de la tabla `usuarios` (`usuarios.id` = `auth.users.id`), no del
frontend, y un restaurante con `suscripcion_activa = false` o
`fecha_vencimiento` vencida bloquea el acceso (salvo `super_admin`).

## Modos de ejecución

1. **Local** (en desarrollo, sin `.env.local`): login y roles sobre un
   dataset simulado (restaurante demo con mesas y dinero, un restaurante vacío y
   uno vencido) persistido en `localStorage`. Credenciales en `/login`.
2. **Demo** (`/demo`): las 4 vistas con datos de ejemplo, sin login, con el
   recorrido guiado "Hazlo por mí" y persistencia en `localStorage` (el botón
   *Vaciar el demo* lo reinicia). No toca Supabase.
3. **Supabase**: define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (ver [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)).

Los tres usan el mismo `src/lib/api.ts`; solo cambia la implementación que
devuelve `getApi()` (`realApi`, `localApi` o `mockApi`).

## Instalación

Sin Supabase (modo local, por defecto):

```bash
npm install
npm run dev
```

Con Supabase:

```bash
npm install
cp .env.example .env.local   # completa URL y anon key de Supabase
npm run dev
```

Para crear el proyecto, aplicar el SQL y los usuarios:
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

## Scripts

```bash
npm run dev                  # vite
npm run build                # tsc && vite build
npm run preview              # sirve dist/
npm run typecheck            # tsc --noEmit
npm run verificar            # 500 checks de reglas de negocio (backend local)
npm run verificar:responsive # 332 checks de layout en 4 viewports
npm run capturas:demo        # capturas del recorrido guiado (Playwright)
npm run sql:install          # regenera supabase/TODO_EN_UNO.sql
```

## Verificar que nada se rompió

```bash
npm run typecheck
npm run verificar
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
del super admin con datos, en 360, 390, 768 y 1280 px. Falla si el documento
gana scroll horizontal o si un control táctil queda por debajo de 28 px. Aparta
`.env.local` mientras corre (modo local) y lo restaura al terminar.

Ambas suites salen con código 1 si algún check falla.

## Desplegar en Vercel

1. Sube el repo a GitHub (`git init`, commit, push).
2. Importa el proyecto en https://vercel.com (el `vercel.json` ya configura el
   rewrite SPA para que `/admin` o `/super-admin` no den 404 al recargar).
3. **Settings → Environment Variables**: `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` en Production y Preview.
4. Deploy. Build: `npm run build`, output: `dist`.
5. En Supabase, **Authentication → URL Configuration**: Site URL y Redirect URLs
   con el dominio final (`/restablecer` incluido).
6. Tras cambiar variables de entorno, **redeploy**: Vite las incrusta en el
   build, no las lee en tiempo de ejecución.

## Estructura

```
src/
  components/ui.tsx        primitives compartidas (botón, modal, input, chip, tabla...)
  lib/
    api.ts                 realApi + localApi + mockApi y todas las reglas de negocio
    localSeed.ts           dataset simulado del modo local
    format.ts              formato de moneda, fechas y estados
    pagos.ts               métodos de pago y etiquetas
    supabase.ts            cliente de Supabase
  pages/
    landing/  Login/  mesero/  cocina/  admin/  cajero/  superadmin/
  demo/                    recorrido guiado y datos del modo demo
  types/database.ts        tipos del schema (roles, estados, filas, funciones RPC)
supabase/
  TODO_EN_UNO.sql          instalador único (generado, es el que se pega)
  fuentes/                 19 archivos fuente en orden de aplicación
scripts/
  verificar-flujo.mjs      suite de reglas de negocio (500 checks)
  verificar-responsive.mjs suite de layout responsive (332 checks)
  capturas-demo.mjs        capturas del recorrido guiado
  build-install-sql.mjs    genera TODO_EN_UNO.sql
```

## Base de datos

Todo el SQL se instala de una vez: `supabase/TODO_EN_UNO.sql`. Se genera desde
`supabase/fuentes/` con un orden fijo (schema → migraciones → RPC → RLS →
módulos de Super Admin). Instrucciones completas en
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

## Reglas de negocio (idénticas en local, demo y Supabase)

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

El SQL completo vive en `supabase/fuentes/` (19 archivos) y se empaqueta en
`supabase/TODO_EN_UNO.sql`. Ese es el archivo que se pega en el SQL Editor; no
hay que ejecutar los fuentes uno a uno. `npm run sql:install` lo regenera.

El frontend asume estos nombres de tabla y columna (`src/types/database.ts`):

- `restaurantes`: `id`, `nombre`, `suscripcion_activa` (bool), `fecha_vencimiento` (timestamptz)
- `usuarios`: `id` (= `auth.users.id`, PK), `restaurante_id`, `rol` (`super_admin` | `admin_restaurante` | `mesero` | `cocina`), `nombre`
- `zonas`: `id`, `restaurante_id`, `nombre`
- `mesas`: `id`, `restaurante_id`, `zona_id`, `nombre`, `estado`
- `categorias_productos`: `id`, `restaurante_id`, `nombre`
- `productos`: `id`, `restaurante_id`, `categoria_id`, `nombre`, `precio`, `disponible`, `es_promocion`, `precio_promocion`, `es_bebida`
- `pedidos`: `id`, `restaurante_id`, `mesa_id`, `mesero_id`, `estado` (`pendiente` | `en_preparacion` | `listo` | `entregado` | `anulado`), `created_at`, `updated_at`
- `pedido_items`: `id`, `pedido_id`, `producto_id`, `nombre_producto`, `cantidad`, `precio_unitario`, `nota`, `anulado`, `anulado_por`, `anulado_at`
- `cuentas`: `id`, `restaurante_id`, `mesa_id`, `total`, `metodo_pago`, `estado`, `pagado_at`
- `cuenta_pedidos`: `id`, `cuenta_id`, `pedido_id`, `subtotal`
- `cuenta_pagos`: pagos parciales (efectivo/tarjeta/Yape), propina y vuelto
- `caja_turnos`: turnos de caja con monto inicial, arqueo y diferencia
- `correlativos`: contador de boletas por restaurante (solo lo usa la RPC)
- `restaurante_pins`: PIN de autorización para anular cobros
- `configuracion_global`: fila única con nombre, soporte, logo y precio del plan
- `planes`, `suscripciones_historial`: catálogo y bitácora de suscripciones
- `soporte_tickets`: tickets de soporte
- `audit_logs`: auditoría de cambios sensibles

> El usuario en `usuarios` debe existir para cada cuenta de Supabase Auth (RLS permite leer su propia fila y la del restaurante al que pertenece).

## Estado actual

Implementado. Última verificación registrada (`npm run verificar`: 500 checks;
`npm run verificar:responsive`: 332 checks en 4 viewports):

- Auth (email/password), lectura de rol desde `usuarios`, rutas protegidas por rol y bloqueo por suscripción vencida.
- **Vista Mesero**: grilla de mesas por zona, toma de pedido desde el menú (categorías, promociones, notas por ítem), envío de comanda atómica (`crear_pedido`), **varias comandas por mesa** con pantalla intermedia que acumula el total, y cierre de cuenta con método de pago, pago dividido, propina y boleta imprimible (`cerrar_cuenta`), con **edición y anulación de ítems** desde la comanda abierta.
- **Vista Cocina**: comandas en columnas por estado (pendientes / en preparación / listos) con cronómetro de espera, avance de estado y separación cocina/barra por `es_bebida`. Las comandas cobradas desaparecen y los ítems anulados salen tachados.
- **Vista Admin**: dashboard de ventas (hoy/mes, ticket promedio, top productos, ventas por mesero, métodos de pago y horarios pico), **Caja por turnos** con arqueo y aviso (no bloqueo) de mesas sin cobrar, **Cobros** con anulación y PIN, gestión de zonas, mesas, categorías y productos, personal y datos del local. Export CSV y reportes imprimibles.
- **Vista Super Admin**: restaurantes, administradores, usuarios, suscripciones, estadísticas, auditoría, notificaciones, soporte y configuración global.
- **Modo local** (en desarrollo, sin `.env.local`): login y roles reales sobre un dataset simulado, persistencia en `localStorage` y botón de reset en `/login`.
- **Modo demo** (`/demo`): las 4 vistas sin login, con recorrido guiado que escribe por ti ("Hazlo por mí"), persistencia en `localStorage` y botón para vaciarlo.
- **Rendimiento**: code-splitting por ruta; la landing y el login no descargan el panel.
- **Base reproducible**: `supabase/TODO_EN_UNO.sql` (19 archivos, RLS y grants incluidos).

Todo el acceso a datos pasa por `getApi()` (capa real/local/mock), por lo que las
vistas funcionan igual en los tres modos. Las reglas de negocio están
centralizadas para que `localApi`, `mockApi` y las RPC de Postgres se comporten
igual; `npm run verificar` las cubre automáticamente.

### Pendiente para publicar

- Aplicar `supabase/TODO_EN_UNO.sql` en el proyecto real y crear los usuarios
  ([`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)).
- Variables de entorno en Vercel y dominio final en Supabase Auth.
- Recorrido manual de aceptación contra la base real (mesero → cocina → cajero).
- Mejoras pendientes: reconciliación ante una respuesta incierta al cobrar e impresión de ticket de cocina. El focus trap de los modales y el filtro de productos agotados ya están implementados.

## Integración continua

GitHub Actions ejecuta `npm ci`, `npm run typecheck` y `npm run build` al abrir
un pull request o actualizar `main`/`master`. Para que se active, Mesora debe ser
la raíz del repositorio GitHub.

En builds de producción, Mesora requiere `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY`. Si faltan, el login de prueba local se deshabilita; el
modo local sigue disponible durante el desarrollo y `/demo` permanece público.
