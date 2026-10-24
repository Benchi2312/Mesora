# Mesora — Estado del proyecto y detalle de todos los cambios

Documento de traspaso. Sirve para que cualquier persona (o cualquier agente) que
abra el repositorio entienda **qué se construyó, por qué, qué invariantes hay que
respetar y qué falta**, sin tener que leer todo el código ni la conversación.

Última verificación registrada (2026-10-22):

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | sin errores |
| `npm run verificar` | **500 pasaron, 0 fallaron** (26 bloques) |
| `npm run verificar:responsive` | **332 pasaron, 0 fallaron** (4 viewports) |
| `npm run build` | `✓ built`; chunks por ruta, inicial ~401 kB (120 kB gzip) + React 311 kB |
| `npm run sql:install` | genera `supabase/TODO_EN_UNO.sql` (los 19 archivos de `supabase/fuentes/`, 239 030 bytes · 4 673 líneas · sha256 42dcf05d2289); incluye chequeos de delimitadores, encoding y cobertura de la lista de orden |

Los tres primeros verdes son **sobre el backend local**: cubren la lógica y el
layout de la app, no el SQL. Lo verificado de `supabase/*.sql` es estático (los
comandos no tocan Postgres): el último comprueba que los diecinueve archivos estén
en la lista de orden, con los `$$` emparejados y sin caracteres inválidos, y genera
el archivo único para pegar. Además se cruzaron a mano las columnas: **todo** lo
que `realApi` menciona en `select`/`insert`/`update`/`eq`/`order` existe en el
schema que crea el repo, y las policies de `01_rls_completo.sql` solo usan
columnas existentes. Para correrlo contra una base de verdad,
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

---

## 1. Contexto rápido

- **Stack**: React 19 + TypeScript + Vite. Sin framework de UI propio; CSS con
  variables y clases utilitarias en `src/index.css`.
- **Ubicación**: `C:\Users\benja\Downloads\Mesora`.
- **Producto**: punto de venta para restaurante (mesero → cocina/barra → admin).
- **Tres backends intercambiables**, todos detrás de la misma interfaz `DataApi`
  (`src/lib/api.ts`):
  - `realApi` — habla Supabase (`supabase-js`). Se activa cuando existe
    `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; el proyecto
    real es `yyfsewgxyyqjyzcejsqq`. El schema ya está aplicado allí, pero **la app
    no se ha recorrido de punta a punta contra esa base** (ver §9).
  - `localApi` — backend completo en memoria con persistencia en
    `localStorage` (con credenciales simuladas). Es el modo de trabajo real del
    proyecto y el que ejercitan las suites.
  - `mockApi` — datos semilla del demo, con persistencia en `localStorage`
    (el botón "Vaciar el demo" los reinicia). `/demo` siempre usa `mockApi`.
  - `getApi()` devuelve el activo según `setApi('local' | 'demo' | 'real')`.
- **SQL reproducible**: `npm run sql:install` concatena los 19 archivos de
  `supabase/fuentes/` en `supabase/TODO_EN_UNO.sql`, que es lo único que se pega
  en Supabase. El schema base (8 tablas + `correlativos`, `cuentas` y
  `cuenta_pedidos`) se restauró completo: la copia anterior estaba truncada.
- **La seguridad de acceso de las tablas base vive en un solo archivo**,
  `supabase/01_rls_completo.sql`: RLS, policies, permisos de tabla y permisos de
  función de las 13 tablas del dominio, y define `soy_super_admin()` y los demás
  helpers de rol. **Se aplica antes de los módulos de Super Admin**, porque sus
  policies usan esos helpers. Los 7 archivos de Super Admin
  (`admin_super_restaurante`, `usuarios_super_admin`, `estadisticas_super_admin`,
  `soporte`, `suscripciones_super_admin`, `auditoria`, `configuracion_global`)
  crean tablas y RPCs propias (6 tablas más, 19 en total) y **sí** agregan
  policies/grants para lo suyo. Inventario base en §4.12.
- **Git**: el repositorio real es el del padre (`C:\Users\benja\.git`);
  `Mesora` no es un repo propio.

### Comandos

```bash
npm run dev                  # servidor de desarrollo
npm run typecheck            # tsc --noEmit
npm run verificar            # 500 checks de reglas de negocio (backend local)
npm run verificar:responsive # 332 checks de layout en 4 viewports (Playwright)
npm run capturas:demo        # capturas del recorrido guiado
npm run build                # build de producción
npm run sql:install          # regenera supabase/TODO_EN_UNO.sql
```

---

## 2. Mapa de lo que se cambió

### Archivos nuevos

| Archivo | Qué es |
| --- | --- |
| `src/lib/pagos.ts` | Lógica pura de pago: métodos, pago dividido, propina, vuelto, reparto. |
| `src/lib/caja.ts` | Lógica pura de caja: ventas en efectivo del turno, arqueo, validaciones de apertura/cierre, parser de montos. |
| `src/lib/reporte.ts` | Construcción del reporte y descarga del CSV. |
| `src/pages/admin/CajaTab.tsx` | Pantalla de caja del admin (abrir gaveta, arqueo, histórico). |
| `supabase/caja_turnos.sql` | Tabla `caja_turnos` + RPCs `abrir_turno_caja` / `cerrar_turno_caja`. Sus policies y grants se movieron a `01_rls_completo.sql`. |
| `supabase/rpc_cerrar_cuenta.sql` | RPC de cobro con pago dividido (reescrito). |
| `supabase/rpc_crear_pedido.sql` | RPC segura de creación de pedidos. |
| `supabase/migracion_items_anulables.sql` | Migración de anulación de ítems. |
| `supabase/pin_autorizacion.sql` | PIN del restaurante + RPCs de anulación de ítems y de cuentas (`anular_item_comanda`, `anular_cuenta`) con validación de PIN. |
| `supabase/rpc_anular_cuenta.sql` | Columnas de anulación en `cuentas` + RPC `anular_cuenta` (con `for update`, devuelve el monto a devolver). |
| `supabase/migracion_productos_es_bebida.sql` | Migración del flag `es_bebida`. |
| `supabase/00_schema_base.sql` | **Las 10 tablas del dominio, con sus checks, FKs, índices y el trigger de `pedidos.updated_at`. Es lo primero que se aplica.** |
| `supabase/00_seguridad_rpcs.sql` | `validar_acceso_restaurante`: suscripción vigente + usuario activo, en el servidor. Se aplica tras el schema base. |
| `supabase/01_rls_completo.sql` | **RLS de las 13 tablas base + permisos de tabla y de funciones; define `soy_super_admin()` y los helpers de rol. Se aplica antes de los módulos de Super Admin.** Inventario y reglas en §4.12. |
| `supabase/99_crear_usuario_prueba.sql` | Restaurante de prueba y los 5 perfiles enlazados a los usuarios de Supabase Auth por email. |
| `supabase/TODO_EN_UNO.sql` | Generado por `npm run sql:install`: los 18 archivos de `supabase/fuentes/` en orden, para pegar de una vez. No editar a mano. |
| `SUPABASE_SETUP.md` | Guía de instalación: crear proyecto, usuarios, aplicar SQL, `.env.local`, verificación y errores frecuentes. |
| `scripts/build-install-sql.mjs` | Genera `TODO_EN_UNO.sql` y falla si algún `supabase/fuentes/*.sql` no está en la lista de orden. |
| `src/components/pin.tsx` | Hook `usePinAutorizacion`, `CampoPin` y caché del PIN por restaurante. |
| `src/pages/admin/CobrosTab.tsx` | Listado de boletas del día con su estado y anulación (motivo + PIN). |
| `src/pages/admin/SoporteTab.tsx` | **Soporte del lado del restaurante**: el admin reporta incidencias y ve solo las de su local (código, asunto, prioridad/estado, fechas, responsable). |
| `src/lib/dominio.ts` | Lógica pura de la identidad por dominio: `normalizarDominio`, `esDominioValido`, `esUsuarioValido`, `construirEmail` y `separarEmail`. |
| `scripts/verificar-flujo.mjs` | Suite funcional headless (433 checks). |
| `ESTADO_Y_CAMBIOS.md` | Este documento. |

### Módulos de Super Admin (nuevos)

| Archivo | Qué es |
| --- | --- |
| `supabase/admin_super_restaurante.sql` | RPCs `admin_actualizar_restaurante` y `admin_cambiar_suscripcion` (SECURITY DEFINER, exige `soy_super_admin()`). |
| `supabase/usuarios_super_admin.sql` | RPCs de alta, cambio de estado y designación de usuarios, y `admin_ultimos_accesos`. |
| `supabase/estadisticas_super_admin.sql` | RPC `admin_estadisticas_globales`: resumen, comparaciones, ranking y evolución con agregados en la base. |
| `supabase/soporte.sql` | Tabla `soporte_tickets`. **El soporte está invertido**: `select` permite al super admin (todo) o al admin del restaurante (solo su local); `insert` solo al admin del restaurante para su local; `update` (gestión) solo al super admin. |
| `supabase/suscripciones_super_admin.sql` | Tablas `planes` y `suscripciones_historial`, columnas `restaurantes.plan_id`/`fecha_inicio`, 4 RPCs de suscripción. |
| `supabase/auditoria.sql` | Tabla `audit_logs`, policies y triggers de auditoría sobre `restaurantes`, `usuarios` y `suscripciones_historial`. |
| `supabase/configuracion_global.sql` | Tabla `configuracion_global`, RPCs de lectura/edición y trigger que audita los cambios. |
| `src/lib/usuarios.ts` | Filtros, orden (nombre/alta/rol) y etiquetas del panel Usuarios. |
| `src/lib/estadisticas.ts` | Rangos, fórmula de agregación (misma que la RPC) y orden del ranking. |
| `src/lib/auditoria.ts`, `src/lib/soporte.ts`, `src/lib/configuracion.ts` | Lógica pura de filtros, etiquetas y validaciones de sus paneles. |
| `src/pages/superadmin/SuperAdminUsuarios.tsx`, `SuperAdminEstadisticas.tsx`, `SuperAdminAuditoria.tsx`, `SuperAdminSoporte.tsx`, `SuperAdminConfiguracion.tsx` | Pantallas del panel de Super Admin. `SuperAdminSoporte.tsx` **solo gestiona** (estado/prioridad/responsable): no crea tickets. |

### Archivos modificados de fondo

| Archivo | Cambios principales |
| --- | --- |
| `src/lib/api.ts` (2 972 líneas) | Motor común `crearApiDesde`; pagos divididos; caja; datos del local; personal; catálogo; métricas con `cuenta_pagos`; guard `errorDeAcceso` y mutex por mesa; PIN de autorización y anulación de ítems/cuentas; y el panel de Super Admin (restaurantes, suscripciones, usuarios, estadísticas, auditoría, soporte y configuración global). |
| `src/types/database.ts` (471 líneas) | Tipos `Pago`, `TurnoCaja`, flags de anulación, `propina`/`vuelto`, tabla `cuenta_pagos`, firma nueva de `cerrar_cuenta`, `EstadoCuenta = 'pendiente' \| 'pagada' \| 'anulada'` con `anulada_at`/`anulada_por`/`motivo_anulacion`/`monto_reembolsado`, `Metricas` con `anulacionesMes`/`reembolsosMes`, `Restaurante.pin_autorizacion`, y los tipos del panel de Super Admin (`Plan`, `SuscripcionHistorial`, `SoporteTicket`, `AuditLog`, `ConfiguracionGlobal`, `UsuarioPlataforma`). |
| `src/lib/caja.ts` | `ventasEfectivoDelTurno` descuenta las boletas anuladas dentro de la ventana del turno (y solo entonces). |
| `src/pages/cajero/Cajero.tsx` | Tabs `Turno` y `Boletas de hoy`: el cajero ve la caja y sus cobros, nada más. |
| `src/pages/mesero/CerrarCuenta.tsx` (858 líneas) | Pago simple/dividido, propina, vuelto, boleta y PDF. |
| `src/lib/metricas.ts` | Reparto por método con detalle de pagos; `propinasMes` / `vueltoMes`. |
| `src/lib/localSeed.ts` | Dataset local con `pagos` y `cajaTurnos`. |
| `src/pages/admin/DashboardTab.tsx` | Export CSV, impresión, tarjeta de propinas/vuelto. |
| `src/pages/admin/Admin.tsx` | Nueva tab Caja. |
| `src/pages/mesero/MenuPicker.tsx` | Tope de 99 unidades. |
| `src/pages/mesero/MesaOcupada.tsx` | Editar/anular, pluralización, `cargandoLabel`. |
| `src/pages/cocina/Cocina.tsx` | Estados bloqueados, `aria-pressed`. |
| `src/components/ui.tsx` | Accesibilidad del `Modal`/`ConfirmDialog`. |
| `src/index.css` | Estilos de impresión. |
| `src/components/AppLayout.tsx` | Header con `no-print`. |

---

## 3. Reglas de negocio (leer antes de tocar nada)

Estas son las invariantes que sostienen el resto. Si rompes una, el dashboard,
la caja y el reporte dejan de cuadrar entre sí.

1. **La boleta se arma con la cuenta persistida**, nunca con el total que tenía
   el navegador. Si el backend corrige el importe, la boleta describe la cuenta
   real.
2. **`cuentas.total` es el total de la comanda.** La propina va en
   `cuentas.propina` y el vuelto en `cuentas.vuelto`, aparte.
   - Reporte y dashboard: la propina **no** cuenta como venta (no infla el
     margen).
   - Caja: la propina en efectivo **sí** cuenta en la gaveta (es dinero que
     entró), pero tampoco es venta.
3. **El detalle de pagos vive en `cuenta_pagos`**, una fila por método (siempre
   ≥ 1 por cuenta pagada, incluso en pago simple). `cuentas.metodo_pago` solo
   guarda el método principal y **no** alcanza para contabilidad.
4. **`monto: 0` o `null` en una parte significa "el resto que falta"**, no "el
   total completo". Se completa con `a_pagar − (suma de los montos explícitos)`.
   - Solo una parte puede quedar así.
   - Si las demás partes ya cubren el total, se rechaza (esa parte no aporta).
5. **El vuelto solo sale del efectivo.** Una parte de tarjeta/Yape que supere el
   total se rechaza.
6. **La anulación es lógica**: `pedido_items.anulado/anulado_por/anulado_at`. No
   se borra nada; deja rastro. Un ítem anulado no suma, no va a cocina y no
   entra en la boleta.
7. **Solo se edita/anula en comandas no cobradas**, y `anularItem` es idempotente.
8. **El precio y el nombre los pone el servidor**, nunca el cliente
   (`rpc_crear_pedido.sql`). La cantidad se limita a 1–99.
9. **Caja**: un solo turno abierto por restaurante. El efectivo se cuenta en la
   ventana `[fecha_apertura, fecha_cierre)`. Al cerrar se congelan
   `monto_declarado`, `monto_esperado` y `diferencia`.
10. **El código del cliente no es la autoridad**: `realApi` solo manda IDs a
     Supabase; los RPCs validan pertenencia, rol, disponibilidad y precios.
11. **Ninguna escritura sin suscripción vigente y usuario activo**: toda RPC que
     escribe llama primero a `validar_acceso_restaurante`, y toda escritura del
     backend local pasa por `errorDeAcceso`. La UI que bloquea es cortesía, no
     seguridad.
12. **Cobrar dos veces la misma mesa no puede**: el lock va **antes** del chequeo
    de "ya cobrado" (`for update` de la mesa en SQL, mutex por mesa en local), no
    después. Lock después del chequeo no protege nada.
13. **Anular es lógica y es de `pagada` a `anulada`, nunca al revés.** Queda
    `anulada_at`, `anulada_por`, `motivo_anulacion` y `monto_reembolsado`
    (`total + propina`). Una boleta anulada **no** es venta: sale del reporte, del
    dashboard y del arqueo, y su devolución **sí** sale de la gaveta del turno en
    que se anuló (no del turno en que se cobró, porque ese dinero nunca estuvo
    ahí).
14. **El PIN es del restaurante, no de la persona**, y es opcional: si no hay PIN
    configurado, anular no pide nada. Si lo hay, hace falta y solo lo configura o
    quita el **admin del restaurante**. El hash vive en `restaurante_pins`
    (`crypt`/pgcrypto), nunca en `restaurantes` ni en el cliente. El rol decide
    *quién* puede anular; el PIN decide *quién* lo autoriza.
15. **El mesero nunca anula cobros.** Solo admin y cajero, y los dos con el mismo
    camino (`CobrosTab`). El mesero sigue pudiendo anular *ítems* de una comanda
    abierta (§4.1).

---

## 4. Detalle por área

### 4.1 Editar y anular ítems de una comanda abierta

**Qué se agregó.** En `MesaOcupada.tsx`, cada ítem de una comanda no cobrada
tiene controles para editar cantidad/nota y para anular. `MenuPicker` recibió
además el tope `CANTIDAD_MAXIMA = 99` (`src/pages/mesero/MenuPicker.tsx:15`),
aplicado en tres capas:

- el botón `+` se deshabilita al llegar al máximo (`:315`);
- `agregar` avisa y no sube de 99 (`:96`);
- `enviar` revalida y avisa antes de mandar (`:121-128`), y el botón de enviar
  queda bloqueado mientras haya un ítem fuera de rango (`:353`).

**Detalle de UI.** `cargandoLabel="Anulando…"` en el `ConfirmDialog` para que el
botón no parezca colgado (`MesaOcupada.tsx:253`), y el contador de anulados
pluraliza: `{anulados} {anulados === 1 ? 'anulado' : 'anulados'}` (`:184`).

**SQL.** `supabase/migracion_items_anulables.sql` agrega las tres columnas.
`supabase/rpc_crear_pedido.sql` es una RPC `security definer` que ignora los
precios y nombres que mande el cliente, valida que el producto esté disponible y
limita cantidades.

### 4.2 Cobro, cuenta persistida y boleta

`cerrarCuenta` devuelve la `Cuenta` **guardada** (no un `true`). La pantalla
`CerrarCuenta` construye la boleta y el PDF (jsPDF, A5) desde esa cuenta:
`numeroBoleta(cuenta.id)`, `pagado_at ?? created_at`, y el total desagregado en
base/IGV.

Los datos del local (nombre, RUC, dirección, teléfono, email) salen de
`actualizarRestaurante` y se imprimen en la boleta (`CerrarCuenta.tsx:576+`).

### 4.3 Pago dividido, propina y vuelto

Es la parte más delicada, así que va con detalle.

**`src/lib/pagos.ts`** — toda la lógica es pura y testeable:

| Export | Qué hace |
| --- | --- |
| `METODOS_PAGO_LABEL` / `METODOS_PAGO_LISTA` / `labelMetodoPago` | Etiquetas. `Record<MetodoPago, string>` obliga a que todo método tenga texto: si agregas uno a la whitelist, el typecheck falla hasta que lo etiquetes. |
| `PagoParte` | `{ metodo, monto, referencia? }`. |
| `PROPINAS_SUGERIDAS = [0, 5, 10, 15]` | Botones de propina. |
| `resumirPago(total, partes, propina)` | Valida el desglose y devuelve `{ total, propina, aPagar, recibido, vuelto, efectivo, noEfectivo, valido, error }`. Reglas: sin partes → error; monto ≤ 0 → error; método fuera de whitelist → error; recibido < aPagar → error; no-efectivo > aPagar → error (el vuelto solo sale del efectivo). |
| `completarPartes(partes, aPagar)` | **La regla clave.** Resuelve las partes "exactas" (`monto ≤ 0`) con el resto que falta. Rechaza dos partes exactas y rechaza la exacta si las demás ya cubren el total. |
| `vueltoRapido(recibido, aPagar)` | Vuelto del cobro en un solo método (siempre ≥ 0). |
| `repartoSugerido(aPagar, metodos)` | Reparto equitativo **que cuadra al céntimo**: el último absorbe la diferencia de redondeo. |

**API.** Se agregó `cerrarCuentaDividida(rid, mesa, pedidos, pagos, propina)` a
`DataApi`. El motor compartido está en `cerrarCuentaDivididaEn`
(`src/lib/api.ts:961`), que:
valida la whitelist → calcula el total **desde el backend** → llama a
`completarPartes` → `resumirPago` → crea la `Cuenta` (con `propina`, `vuelto` y
el método principal) → inserta una fila en `ds.pagos` por parte → marca los
pedidos como entregados → libera la mesa → persiste.

`cerrarCuenta` (pago simple) **delega** en ese mismo camino enviando
`[{ metodo, monto: 0 }]`, así que no hay dos implementaciones que puedan
divergir.

**Interfaz.** `CerrarCuenta.tsx` tiene un selector de método (o "Dividir"), un
resumen vivo (a pagar / recibido / vuelto) y un bloque de propina. Detalles que
importan:

- El campo "Efectivo recibido" **solo aparece con efectivo**. Con tarjeta no hay
  billete que devolver, y mandar un importe mayor por tarjeta sería rechazado
  por el backend; ocultarlo evita una pantalla que promete algo imposible.
- El envío usa el camino corto (`cerrarCuenta`) **solo si** no hay división, no
  hay propina y no se tecleó un billete mayor al total (`CerrarCuenta.tsx:162`).
  Si hay propina o vuelto, va por `cerrarCuentaDividida` para que ambos queden
  guardados.
- Cuando el resumen no cuadra, el botón de cobrar se bloquea y se muestra el
  motivo (`errorResumen`, `:107`), sin mostrar números inventados.

**Boleta y PDF** muestran subtotal, IGV, propina, total, recibido y vuelto,
leyéndolos de la cuenta guardada.

**SQL.** `supabase/rpc_cerrar_cuenta.sql` reescrito:
`cerrar_cuenta(p_restaurante_id, p_mesa_id, p_pedidos, p_pagos, p_propina)` →
crea la tabla `cuenta_pagos` con su check `monto > 0`, valida métodos y montos,
aplica la misma regla de "exacto = el resto que falta", calcula
`vuelto = recibido − a_pagar`, y **congela** `monto_esperado`/`diferencia` al
cerrar el turno.

### 4.4 Métricas: el punto donde casi se miente

`computeMetricas` (`src/lib/metricas.ts`) es la función que usan **los tres**
backends, así que el dashboard nunca inventa números distintos de los que ve el
reporte.

Nuevo parámetro: `pagos: ReadonlyArray<Pick<Pago,'cuenta_id'|'metodo_pago'|'monto'>> = []`.

- `porMetodo` reparte cada cuenta entre los métodos que realmente la pagaron.
  Sin detalle (cuentas viejas) cae al método principal, como antes.
- **El vuelto no se le carga a ningún método**: se resta de la parte efectivo, y
  por construcción `Σ porMetodo.total === ventaMes`.
- Se agregaron `propinasMes` y `vueltoMes` a `MetricasAdmin` (no son venta).

`getMetricasAdmin` de `realApi` ahora consulta `cuenta_pagos` para el
restaurante; el motor local filtra `ds.pagos`.

### 4.5 Caja por turnos

**`src/lib/caja.ts`** (puro, igual que el resto):

- `ventasEfectivoDelTurno(cuentas, apertura, cierre, pagos = [])` — efectivo de la
  ventana `[apertura, cierre)`. Con detalle de pagos suma **solo la parte
  efectivo** y le resta el vuelto (30 efectivo + 3 Yape para una cuenta de 28 →
  25 en la gaveta). Sin detalle, usa el método principal.
- `arqueoTurno(turno, cuentas, pagos = [])` → `{ inicial, ventas, esperado,
  declarado, diferencia, cuadrado }`.
- `errorAlAbrirTurno` / `errorAlCerrarTurno` — mensajes de error que el front
  muestra al instante, con los mismos mensajes que el backend.
- `redondear`, `parseMonto` (acepta `1,234.50`, `1234,50`, `1.234.567`).

**UI.** `src/pages/admin/CajaTab.tsx` + tab `Caja` en `Admin.tsx`: abrir gaveta
(monto inicial), ver el esperado en vivo mientras se cobra, declarar el efectivo
contado y cerrar con arqueo e historial. Necesita `getPagosDeCuentas` para
arquear con pago dividido.

**SQL.** `supabase/caja_turnos.sql`: tabla con índice único parcial para un solo
turno abierto por restaurante, RLS, `abrir_turno_caja` y `cerrar_turno_caja`
(`for update` para que dos terminales no cierren el mismo turno a la vez). El
cálculo de efectivo usa `left join lateral` sobre `cuenta_pagos` con fallback al
método principal.

### 4.6 Reportes de ventas (CSV) e impresión

`src/lib/reporte.ts`:

- `construirReporte(nombre, cuentas, metricas, ahora?)` agrupa por día local
  (no UTC: "la venta del lunes" es del lunes donde está el local) y expone
  `propinas`/`vuelto` tomados de las métricas.
- `reporteACsv(reporte)` arma el CSV con secciones: resumen, ventas por día,
  métodos de pago, horarios pico, top productos, ventas por mesero.
- Separador **`;`** (en es-PE la coma es decimal: un CSV con `,` parte "12,50"
  en dos columnas), **BOM UTF-8** (sin él Excel abre los acentos rotos), y
  `celda()` entrecomilla si el valor contiene `"`, `;`, `,` o salto de línea.
- `nombreArchivoReporte` y `descargarReporte` (Blob + enlace temporal; los URI
  `data:` largos se recortan en algunos navegadores).

`DashboardTab` tiene los botones de exportar e imprimir; `src/index.css` define
el modo impresión y los elementos `no-print` (header y navegación se ocultan).

### 4.7 Datos del local, catálogo y personal

- `actualizarRestaurante` con validación de nombre no vacío; RUC, dirección,
  teléfono y email aparecen en la boleta.
- Productos: `es_bebida` decide si el ítem va a barra (`migracion_productos_es_bebida.sql`),
  precio de promoción, y los agotados se pueden ocultar del selector
  (`getProductos(rid, { incluirAgotados })`).
- Personal: alta/baja/activación con protección del usuario actual (no te
  desactives a ti mismo). **Ojo**: en `realApi` todavía **no** se crea el usuario
  de Supabase Auth ni se manda invitación; es una bandeja pendiente (ver §8).

### 4.8 Accesibilidad

- `Modal`: cierra con Escape y con el overlay, `role="dialog"`,
  `aria-modal="true"`, y enfoca el primer control al abrir.
- `Cocina`: estados bloqueados con `aria-pressed`.
- Los botones de cobro/anulación muestran estado de carga (`aria-busy`,
  `cargandoLabel`) para que no parezca que la app se colgó.

Lo que **no** se hizo: focus trap completo (el foco puede salir del modal con
Tab) ni devolver el foco al elemento que lo abrió.

### 4.9 Modo local / demo

- `localSeed.ts` define `LocalSeedData` con `pagos` y `cajaTurnos`; `restablecerDatosLocal()`
  regenera el seed.
- `type Dataset = LocalSeedData` (`api.ts:849`) y `crearApiDesde(ds, opciones)`
  (`api.ts:1069`) generan `mockApi` (`db`, sin persistencia) y `localApi`
  (`localDb`, con persistencia).
- `reiniciarDemoDatos()` deja el demo como recién abierto, **clonando** cada
  registro del seed (sin clonar, editar una mesa del demo mutaría el seed).
- El demo no persiste entre recargas: si se pierde un cambio, es por diseño.

### 4.10 Seguridad: suscripción, usuario activo y cobro sin duplicados

Los dos riesgos de §9 #2 y #3, cerrados en el servidor y reflejados en local.

**Por qué hacía falta.** El bloqueo por suscripción vencida o por usuario
desactivado era un `if` en el `ProtectedRoute`: una puerta que solo cierra la
pantalla. Con la anon key, `rpc('crear_pedido', ...)` o `rpc('cerrar_cuenta', ...)`
desde la consola pasaban igual. El navegador no es la frontera de confianza.

**El helper (una sola regla para todas las RPC).**
`supabase/00_seguridad_rpcs.sql` define
`validar_acceso_restaurante(p_restaurante_id uuid) returns void`:

1. `auth.uid()` no nulo → si no, `'Sin sesion: hay que iniciar sesion'`.
2. El usuario existe y `coalesce(activo, true)` → si no, `'Usuario desactivado'`.
3. El restaurante existe → si no, `'El restaurante no existe'`.
4. `suscripcion_activa` → si no, `'Suscripcion inactiva'`.
5. `fecha_vencimiento is null or >= now()` → si no, `'Suscripcion vencida'`.

Es `security definer` con `set search_path = public` (lee `usuarios` y
`restaurantes` con permisos del dueño, no con los del que llama) y solo se le
concede `execute` a `authenticated`.

Se invoca con `perform public.validar_acceso_restaurante(p_restaurante_id);`
como **primera** instrucción de las seis funciones que escriben datos:
`crear_pedido`, `cerrar_cuenta`, `abrir_turno_caja`, `cerrar_turno_caja`,
`editar_item_comanda` y `anular_item_comanda`. Al ser la primera, el error de
suscripción gana sobre el de permisos y el mensaje no confunde.

En `src/lib/api.ts`, `errorDeAcceso(ds, rid, apiMode.operadorId)` es el espejo:
mismos mensajes, mismo orden de ideas, y con `apiMode.operadorId` como análogo de
`auth.uid()`. Se llama en `crearPedido`, `editarItem`, `anularItem`, `cerrarCuenta`,
`cerrarCuentaDividida`, `abrirTurno` y `cerrarTurno`. `activo` null cuenta como
activo, igual que `coalesce(activo, true)` en SQL. Si el usuario de la sesión no
está en el dataset, no se bloquea: en modo local no hay auth real y ese caso lo
resuelven los chequeos de pertenencia de cada operación.

**El cobro sin duplicados.** En `cerrar_cuenta`, el chequeo "¿este pedido ya fue
cobrado?" y el marcado como `entregado` tienen que ser un solo paso atómico.
Ahora la función toma el candado **antes** del chequeo:

```sql
perform 1 from public.mesas
 where id = p_mesa_id and restaurante_id = p_restaurante_id
   for update;
```

Se bloquea la fila de la mesa y no los pedidos a propósito: la mesa es el ancla de
la cuenta y siempre existe, mientras que el set de pedidos varía según qué se
mandó; bloquear un set variable obligaría a ordenar ids para no provocar
deadlocks entre dos cierres cruzados. Como cualquier cierre de esa mesa pasa por
el mismo `for update`, el segundo `await`a la fila y, al despertar, ve los
pedidos ya en `entregado` y sale por la rama de "ya fue cobrado" en vez de crear
una segunda cuenta. La pertenencia de los pedidos a la mesa se revalida después,
ya con el candado tomado.

En local, `conLockDeMesa(rid, mesaId, tarea)` (`api.ts`) hace lo propio con una
cadena de promesas por mesa: el cuerpo entero del cierre, desde el chequeo de
cobrados hasta `persistir()`, va dentro del lock. Sin eso, dos `cerrarCuenta` en
paralelo compartían la pausa de `espera()` y creaban dos cuentas del mismo total.

Lo que **no** cubre: escrituras directas sobre tablas desde el navegador
(catálogo, personal, `avanzarPedido`, `liberarMesa`) y la reconciliación tras un
fallo de red (§8 #1). Ver §9 #7.

### 4.11 Roles, PIN de autorización y anulación de cobros

**El rol `cajero`.** Es exclusivo de la caja: entra a `/cajero` y solo ve las tabs
`Turno` y `Boletas de hoy`. No ve dashboard, catálogo, personal ni reportes. El
admin ve todo, incluido el mismo listado de cobros.

**El PIN.** `restaurante_pins (restaurante_id, pin_hash, created_at, updated_at)`
con `crypt(pin, gen_salt('bf'))`; nunca se guarda el PIN en claro ni se manda al
navegador. Lo administra `ConfiguracionTab` (solo admin):

- `tienePinAutorizacion(rid)` — booleano cacheado por `usePinAutorizacion`
  (`src/components/pin.tsx`), para no pedir un PIN que no existe.
- `configurarPinAutorizacion(rid, pin)` / `quitarPinAutorizacion(rid)` — el
  backend rechaza PIN vacío, PIN de menos de 4 dígitos y la falta de confirmación
  en la UI.
- `validar_pin_autorizacion(p_restaurante_id, p_pin)` es **interna**: `security
  definer`, sin `execute` para `authenticated` ni `public`. Solo la llaman las RPC
  de anulación. Si no hay PIN configurado, valida (no hay nada que pedir); si lo
  hay, compara con `crypt`.

**Las dos RPC de anulación** (`supabase/pin_autorizacion.sql`) arrancan siempre con
`perform public.validar_acceso_restaurante(...)`, luego exigen rol
(`admin_restaurante` para ítems; `admin_restaurante` o `cajero` para cuentas),
luego el PIN, y solo entonces escriben. `anular_cuenta` toma `for update` sobre la
cuenta antes de mirar el estado, así que dos terminals no pueden anular dos veces
la misma boleta ni devolver dos veces el dinero.

**Interfaz.** `CobrosTab` lista las boletas del día (`getCuentasDelDia`: pagadas y
anuladas, orden descendente) con su estado, el motivo si fue anulada y quién la
anuló. Para anular pide motivo + PIN (si corresponde) y el botón queda bloqueado
mientras el PIN esté vacío. `MesaOcupada` usa el mismo `CampoPin` al anular ítems.
`getCuentasPagadas` se sigue usando para reportes y CSV: una boleta anulada no
aparece en la venta del día.

**Métricas.** `Metricas` suma `anulacionesMes` (cuenta `anulada_at` del mes) y
`reembolsosMes` (`monto_reembolsado`), y las muestra el dashboard en una tarjeta
aparte.

---

### 4.12 RLS: inventario y reglas (`supabase/01_rls_completo.sql`)

Antes de este archivo, en todo `supabase/` solo había policies para
`caja_turnos` y `restaurante_pins`, y las dos estaban mal (un `for all` de
escritura sobre la tabla del arqueo, y un `for all` que dejaba escribir el
`pin_hash` a mano). Las otras 11 no tenían ninguna: quedaban confiadas a lo que
Supabase otorga por defecto. Ahora las 13 tablas base están en un archivo solo,
idempotente (`drop policy if exists` antes de cada `create policy`), que se aplica
**antes de los módulos de Super Admin** (sus policies usan `soy_super_admin()` y
los demás helpers que define este archivo).

> **Módulos de Super Admin (7 archivos posteriores).** A diferencia de las
> migraciones antiguas, estos **sí** agregan policies y grants para sus propias
> tablas: `planes` y `suscripciones_historial` (`historial_select` con
> `soy_super_admin()`), `soporte_tickets`, `audit_logs` y `configuracion_global`.
> Sus RPCs (`admin_*`, `suscripciones_*`) son `security definer`, hacen
> `revoke ... from public, anon` y `grant execute ... to authenticated` en su
> propio archivo. El inventario de abajo describe solo lo que hace
> `01_rls_completo.sql`.

**Helpers** (las 8 son `security definer` + `stable`, con
`set search_path = public`, y se les revoca `execute` a `PUBLIC`):

| Helper | Devuelve |
| --- | --- |
| `mi_restaurante_id()` | `restaurante_id` del usuario en sesión, si está activo. |
| `soy_super_admin()` | `true` si el usuario en sesión es `super_admin` **activo**. |
| `suscripcion_vigente(rid)` | `true` si el restaurante existe, tiene `suscripcion_activa` y no venció. |
| `tengo_rol(text[])` | `true` si el usuario en sesión está activo y tiene alguno de esos roles. |
| `soy_del_restaurante(rid)` | `true` si el usuario en sesión está activo y pertenece a ese restaurante. |
| `puedo_escribir_en(rid, roles)` | `soy_del_restaurante` + `tengo_rol` + `suscripcion_vigente`. |
| `pedido_es_de_mi_restaurante(pedido_id)` | Para `pedido_items`, que no tiene `restaurante_id`. |
| `cuenta_es_de_mi_restaurante(cuenta_id)` | Para `cuenta_pedidos`, que tampoco lo tiene. |

Son `security definer` a propósito: una policy que hace `select` sobre
`public.usuarios` desde `public.usuarios` se evaluaría recursivamente (error de
políticas). Al ser `definer`, la consulta interna corre como dueño de la tabla y
no vuelve a disparar la policy; las funciones solo devuelven un booleano o el
propio `restaurante_id` del que ya viene la sesión.

**Inventario por tabla** (qué hace hoy `realApi` en cada una):

| Tabla | Lee | Escribe directo | Notas |
| --- | --- | --- | --- |
| `restaurantes` | el admin de su restaurante, `super_admin` | admin, **solo 5 columnas** | `revoke update` + `grant update (nombre, ruc, direccion, telefono, email_contacto)`: sin esto el admin podría hacer `update { suscripcion_activa: true }` sobre su propio restaurante y esquivarse el cobro. |
| `usuarios` | su propia fila, el admin del restaurante, `super_admin` | admin (alta, edición y baja; no se borra a sí mismo) | El `with check` impide crear o convertir a `super_admin` y mover de restaurante. La lectura de la propia fila es lo que permite el bootstrap de sesión (`src/store/auth.ts`). |
| `zonas` | cualquiera del restaurante | admin | |
| `mesas` | cualquiera del restaurante | admin (todo) y mesero/cajero (el `estado`) | `liberarMesa` es un `update` directo, por eso existe la segunda policy. |
| `categorias_productos` | cualquiera del restaurante | admin | |
| `productos` | cualquiera del restaurante | admin | `disponible = true` se filtra en el navegador, no en RLS (ver §9). |
| `pedidos` | cualquiera del restaurante | cocina, mesero y admin, solo para el `estado` | `avanzarPedido` es un `update` directo. |
| `pedido_items` | cualquiera del restaurante | **nada** | Precio y nombre los pone el servidor (`crear_pedido`, `editar_item_comanda`). |
| `cuentas` | admin, cajero y mesero | **nada** | El mesero la necesita para armar la boleta y para no cobrar dos veces. |
| `cuenta_pedidos` | admin, cajero y mesero | **nada** | Sin `restaurante_id`: se resuelve por `cuenta_es_de_mi_restaurante`. |
| `cuenta_pagos` | admin y cajero | **nada** | Lo escribe `cerrar_cuenta` con el importe real de cada parte. |
| `caja_turnos` | admin y cajero | **nada** | **Solo lectura.** Abrir y cerrar pasan por `abrir_turno_caja` / `cerrar_turno_caja`. |
| `restaurante_pins` | **nadie** | **nadie** | Sin policies: el hash no sale de la base por ninguna vía de cliente. Lo usan `tiene_pin_autorizacion` (booleano), `configurar_pin_autorizacion` y `quitar_pin_autorizacion`. |

Reglas que atraviesan las 13 filas:

- **Ningún role ve datos de otro restaurante.** Hasta el `super_admin`: solo lee
  `restaurantes` y `usuarios`, y en `usuarios` no ve nada si no es su fila.
- **Toda escritura directa** pasa por `puedo_escribir_en(rid, roles)`, o sea
  usuario activo + del restaurante + del rol + con suscripción vigente. Un
  usuario desactivado o un restaurante vencido pierden también la escritura
  directa, no solo la RPC.
- **`super_admin` no escribe en nada.** No tiene `insert`/`update`/`delete` en
  ninguna tabla.
- **Permisos de tabla**: `revoke all` a `anon` en las 13; a `authenticated`,
  `select` en las 12 que se pueden leer y escritura solo donde la tabla dice que
  hay escritura directa. Las 6 controladas por RPC no reciben ni un privilege de
  escritura.
- **`revoke truncate` a `authenticated` en las 13.** `TRUNCATE` no pasa por RLS
  (no hay policy que lo filtre): sin este revoke, un `ALL` por defecto de
  Supabase permitiría vaciar `pedidos` o `caja_turnos` aunque todas las policies
  fueran perfectas.
- **Permisos de función** (sección 16 del archivo): `revoke execute` a `PUBLIC` y
  `grant` a `authenticated` de las **19 funciones** —las 10 RPC que usa la app,
  `validar_acceso_restaurante` y los 8 helpers de RLS—, en un solo bloque al
  final, para que el resultado no dependa del orden de aplicación.
  `validar_pin_autorizacion` no se otorga a nadie: ejecutable por el cliente sería
  un oráculo de fuerza bruta del PIN de cualquier restaurante.

**Verificación**: la sección 17 del archivo trae cuatro consultas para correr en el
SQL Editor después de aplicarlo (RLS y policies por tabla, quién puede ejecutar
cada función, columnas actualizables de `restaurantes`, y privilegios por rol).

### 4.13 El schema base (`supabase/00_schema_base.sql`)

Las 10 tablas del dominio no tenían `create table` en ningún archivo del repo: solo
existían como tipos en `src/types/database.ts`. Sin este archivo, los once SQL
restantes no se podían aplicar (ni en una base nueva ni en la de un cliente). Las
decisiones que no son obvias, y por qué:

- **`usuarios.id references auth.users(id) on delete cascade`.** El perfil ES la
  fila de negocio del usuario de Auth. Sin esa FK, `auth.uid()` no encuentra nada,
  el login no sabe rol ni restaurante, y la RLS no tiene contra qué aislar. Por eso
  no hay dos ids: uno de Auth y otro propio.
- **`numeric(12,2)` para todo el dinero.** `supabase-js` devuelve `numeric` como
  string y los tipos del repo lo declaran `number`; el punto fijo de Postgres es
  lo que hace que 0.1 + 0.2 dé 0.30 en una boleta. Nunca `float`.
- **Los CHECK se llaman como los espera la migración.** `pedidos_estado_check`,
  `cuentas_estado_check` y `cuentas_metodo_pago_check` tienen esos nombres exactos
  porque `migracion_items_anulables.sql` y `rpc_anular_cuenta.sql` los borran con
  `drop constraint if exists` y agregan los suyos (con `anulado`/`anulada`). Con
  otros nombres, la migración dejaría dos CHECK vivos a la vez y la boleta anulada
  no se podría guardar.
- **La mesa tiene que ser de una zona del mismo restaurante**, y eso NO puede ser un
  `check (... in (select ...))`: Postgres rechaza subconsultas en un CHECK
  (`cannot use subquery in check constraint`). Es una FK compuesta
  `foreign key (zona_id, restaurante_id) references zonas (id, restaurante_id)`, con
  el `unique (id, restaurante_id)` que eso exige en `zonas`.
- **`cuenta_pedidos.pedido_id` NO tiene índice único, a propósito.**
  `cerrar_cuenta` solo bloquea los pedidos que están en una cuenta **pagada**, así
  que anular una boleta devuelve la comanda al circuito y tiene que poder cobrarse
  otra vez. Un índice único haría fallar esa segunda cuenta por constraint en vez
  de dejarle al cajero ver que la comanda ya se cobró y se anuló. La protección
  real contra el doble cobro es el `for update` sobre la mesa.
- **`productos.es_bebida` ya está en el `create table`.** La migración que lo
  agregaba queda como no-op (`add column if not exists`) y su backfill por nombre
  de categoría sigue sirviendo para poblar productos que ya existieran.
- **`pgcrypto` con `schema extensions`** y las dos funciones del PIN con
  `set search_path = public, extensions`. Supabase instala pgcrypto fuera de
  `public`, así que con `search_path = public` la llamada a `crypt` no resuelve y
  falla recién al validar un PIN, no al crear la función (que es más difícil de
  diagnosticar).
- **`on delete restrict` donde el borrado perdería historia**: `pedidos.mesa_id`,
  `pedidos.mesero_id`, `cuentas.mesa_id`. El corollary es una consecuencia aceptada:
  no se puede eliminar una mesa que ya facturó, ni un mesero que tomó comandas. Para
  dar de baja personal se usa `activo = false`; para retirar una mesa, soporte.
- **Trigger `tocar_updated_at`** en `pedidos`: `avanzarPedido` y `cerrar_cuenta` ya
  escribían `updated_at` a mano, el trigger es la red para la próxima RPC que se
   olvide.

### 4.14 Soporte invertido e identidad por dominio

Dos cambios de producto pedidos juntos porque ambos giran sobre el admin del local:

- **El soporte lo reporta el restaurante, no la plataforma.** El admin tiene una
  pestaña **Soporte** (`src/pages/admin/SoporteTab.tsx`) donde reporta incidencias y
  ve solo las de su local. El super admin (`SuperAdminSoporte.tsx`) ya no crea
  tickets: **solo gestiona** (estado, prioridad, responsable, cierre).
  - **Quién puede qué** (idéntico en SQL, `localApi`/`mockApi` y UI):
    `getTickets` → super admin (todos) o admin de restaurante (solo el suyo);
    `crearTicket` → solo admin de restaurante, y el `restaurante_id`/`usuario_id`
    **salen del operador**, no del formulario (nadie reporta a nombre de otro local);
    `actualizarTicket` → solo super admin. El cajero/mesero/cocina no ven ni reportan
    soporte.
  - **La validación va antes del rol**: un ticket sin asunto falla con
    «El asunto del ticket es obligatorio.» aunque quien lo mande sea el super admin.
  - `supabase/soporte.sql` refleja lo mismo con three policies (`select`/`insert`/
    `update`); ver la fila de la tabla en §2. El ticket sigue mostrándose por su
    `usuario_id` (no se agregó columna `reportado_por`).
- **Identidad por dominio (`usuario@dominio`).** El admin define el dominio de su
  local (ej. `litoral.pe`) en **Configuración → Datos del local**; desde ahí el alta
  de personal (`PersonalTab.tsx`) pide solo el usuario y arma `usuario@dominio`
  (`carlos@litoral.pe`). Sin dominio, el campo de correo queda libre como antes. La
  lógica pura vive en `src/lib/dominio.ts` y se verificó suelta (normalización,
  validación y armado/separación del correo). El dominio es una columna
  `restaurantes.dominio` (`text`), editable por el admin vía `actualizarRestaurante`
  (la RPC `admin_actualizar_restaurante` del super admin **no** lo toca).

### 4.15 Super Admin → Administradores y Usuarios; alta real de personal y recuperación de contraseña

Cierre del Prompt 4. Los módulos de Super Admin ya existían
(`SuperAdminAdministradores.tsx`, `SuperAdminUsuarios.tsx`) con `realApi`
(`getAdministradores`, `getUsuariosPlataforma`, `adminCambiarEstadoUsuario` →
RPC `admin_cambiar_estado_usuario`, `adminDesignarAdministrador` →
RPC `admin_designar_administrador`; ambas `security definer` + `soy_super_admin()`,
sin borrados y sin poder otorgar `super_admin`; SQL en
`supabase/fuentes/usuarios_super_admin.sql`). Lo que faltaba y se hizo:

- **Alta real de personal con cuenta de Auth — Edge Function `crear-personal`.**
  `realApi.crearPersonal` ya no hace un `insert` directo del perfil: invoca la Edge
  Function `crear-personal` (`supabase/functions/crear-personal/index.ts`), que
  - valida el JWT del llamante y exige un `admin_restaurante` **activo**,
  - usa el `restaurante_id` del propio llamante (nunca lo toma del body),
  - acepta solo `mesero | cocina | cajero`,
  - exige contraseña de al menos 8 caracteres,
  - responde `409` si el correo ya existe,
  - crea el usuario en Auth con `service_role` (que **nunca** llega al navegador) y
    el perfil en `public.usuarios`; si el `insert` del perfil falla, **borra** el
    usuario de Auth (rollback),
  - registra auditoría en best-effort.
  - Desplegada y verificada: `supabase functions deploy crear-personal` (proyecto
    `yyfsewgxyyqjyzcejsqq`) → `ACTIVE` v1. Pruebas sin sesión: `401 Sesión requerida.`
    y con la anon key como bearer: `401 Sesión inválida o expirada.`.
- **Formulario de personal.** `PersonalTab.tsx` pide ahora una **contraseña inicial**
  en modo real (mínimo 8 caracteres, que el admin comparte con la persona); en modo
  local sigue usando `PASSWORD_DE_PRUEBA`. La confirmación de creación muestra el
  correo y la contraseña.
- **Recuperación de contraseña.** `pedirRecuperacion` y `cambiarPassword` en
  `store/auth.ts` (`resetPasswordForEmail` con `redirectTo: <origin>/restablecer` y
  `updateUser`). Login (`src/pages/Login.tsx`) tiene «¿Olvidaste tu contraseña?»
  (solo con backend real). Nueva ruta pública `/restablecer`
  (`src/pages/Restablecer.tsx`) para escribir la nueva contraseña; el store escucha
  el evento `PASSWORD_RECOVERY` y redirige a `/restablecer`.
  - **Pendiente de consola (no se puede hacer por CLI):** allow-listear
    `<origin>/restablecer` en Supabase → Authentication → URL Configuration →
    Redirect URLs, y configurar el correo de recuperación.

---

## 5. Verificación automática

`scripts/verificar-flujo.mjs` levanta Vite en modo headless y ejercita la API
**real** (no una simulación): crea comandas, cobra, edita, anula, arquea, y
compara estados. 500 checks en 28 bloques:

| Bloque | Qué cubre |
| --- | --- |
| 0 | El backend activo es el local (sin Supabase). |
| 1 | Dos comandas a la misma mesa antes de cobrar. |
| 2 | Cobrar: cuenta, subtotales, mesa liberada, cocina limpia. |
| 3 | No se puede cobrar dos veces. |
| 4 | Método de pago: solo la whitelist. |
| 5 | Pedidos ya cobrados se excluyen. |
| 6 | Cocina / barra según `es_bebida`. |
| 7 | El dashboard suma la cuenta nueva. |
| 8 | Persistencia: recargar no pierde nada. |
| 9 | Reinicio de datos del demo, aislado del backend local. |
| 10 | Recorrido guiado: detección por datos reales. |
| 11 | Recorrido guiado: anclas, pistas y persistencia. |
| 12 | Editar y anular ítems de una comanda abierta. |
| 13 | Datos del local (incluido el **dominio** guardado y normalizado), catálogo y personal. |
| 14 | Reporte de ventas (CSV). |
| 15 | Caja por turnos (apertura y arqueo). |
| 16 | Pago dividido, propina y vuelto. |
| 17 | Control de acceso: suscripción inactiva, vencida, indefinida; usuario desactivado; restaurante inexistente; y que al restaurar el acceso el flujo vuelva a funcionar. |
| 18 | Concurrencia: dos cobros en paralelo de la misma mesa (pago simple y pago mixto) → una sola cuenta, el segundo recibe "ya fue cobrado", y la mesa sigue operable después. |
| 19 | Anulación de cobros y PIN: el mesero no puede anular, cajero y admin sí, el motivo es obligatorio, sin PIN no se pide nada, con PIN se pide y un PIN malo se rechaza, quitar el PIN devuelve el control, el reembolso es `total + propina`, anular dos veces se rechaza, la boleta anulada no cuenta como venta, y el efectivo sale/entra de la gaveta del turno correcto (mismo turno y entre dos turnos). |
| 20 | Super Admin: alta de restaurante con su administrador (y validaciones del alta). |
| 21 | Super Admin: gestión de restaurantes (listado, filtros, orden, edición y suspensión/reactivación). |
| 22 | Super Admin: suscripciones (catálogo de planes, acciones, historial append-only y restauración). |
| 23 | Super Admin: usuarios y administradores (listado, filtros, orden por nombre/alta/rol, alta, estados y designación; el rol no se designa desde el panel). |
| 24 | Super Admin: estadísticas globales (rangos, resumen con usuarios y administradores, comparaciones, ranking y evolución; y que un operador no las vea). |
| 25 | Super Admin: auditoría, **soporte invertido** (el admin del restaurante reporta y ve solo lo suyo; el super admin gestiona; cajero/mesero/cocina no acceden), alertas, configuración global y dominio; y que las acciones del super admin queden auditadas. |
| 26 | Recorrido guiado del demo: la guía respeta el margen y el ancho en la esquina, y no tapa el modal ni el ancla resaltada. |
| 27 | Recorrido guiado: cada paso tiene XP positivo y el total es la suma. |
| 28 | "Hazlo por mí": abre la pestaña y el formulario correctos, escribe de verdad (zona, mesa, categoría, nombre, precio), avisa qué campo está activo, cancela el temporizador al cerrar y sobrevive a un F5. |

Si agregas comportamiento, **agrega un check**. El formato es
`check('id · lo que se verifica', condicion, detalleSiFalla)`.

---

## 6. Bugs que encontraron los tests (no repetirlos)

Estos equivocados existen hoy en el código y volverían a colarse:

1. **`monto: 0` completaba con el total, no con el resto.** "33 en efectivo + el
   resto en Yape" cobraba 33 + 28. Ahora `completarPartes` (front, backend y
   SQL) completan con `aPagar − suma de los explícitos`.
2. **La propina se ignoraba en el pago simple.** Había selector de propina pero
   se llamaba a `cerrarCuenta`, que cobra el exacto. Ahora la pantalla decide el
   camino según haya propina o billete.
3. **El vuelto se podía "devolver" contra una tarjeta.** Se agregó el límite
   `noEfectivo ≤ aPagar` en las tres capas.
4. **El arqueo local comparaba contra 0.** `monto_declarado` se asignaba
   *después* de calcular el arqueo, así que todo turno salía con faltante total.
   Ahora se escribe antes.
5. **`parseMonto` no entendía `1,234.50`.** Rompía en el arqueo y en el campo de
   montos escritos a mano.
6. **El dashboard habría reportado mal el pago dividido.** Con
   `cuentas.metodo_pago` como fuente, "tarjeta + efectivo" se leía 100% tarjeta.
   Ahora se reparte con `cuenta_pagos` y el vuelto no se carga a nadie.
7. **La gaveta habría contado de más.** Con pago dividido, sumar la cuenta
   completa como efectivo mezcla el vuelto y el Yape. Ahora suma la parte
   efectivo menos el vuelto.
8. **CSV con coma decimal.** Una celda con `12,50` partía la columna en dos.
   `celda()` ahora entrecomilla.
9. **Encoding.** Editar `scripts/verificar-flujo.mjs` con `Get-Content -Raw` +
   `WriteAllText` en PowerShell 5.1 **destruye los acentos** (los lee como
   Windows-1252 y los reescribe como UTF-8 mal). Si te pasa, revertí el
   mojibake leyendo bytes → UTF-8 → Windows-1252 → UTF-8, o usa las herramientas
   de edición que respetan el archivo.
10. **`if (!acceso)` en `anularCuenta` local.** Con el guard invertido, la UI
    aceptaba la anulación de un rol sin permiso y el backend rechazaba al
    usuario legítimo con "no autorizado". El chequeo es `if (acceso)`.
11. **El arqueo mezclaba turnos.** Sumar la boleta si `pagado_at` está en la
    ventana, pero restar la devolución sin mirar `anulada_at`, hace que un cobro y
    su anulación en turnos distintos se cuenten dos veces (o ninguna). Ahora cada
    movimiento se fecha por su propio instante.
12. **La cuenta de demo `cta-4` (anulada) apuntaba a la mesa `m-4`, que no existe
    en el seed.** Los checks que caminaban el historial de esa mesa fallaban por
    datos, no por lógica.

---

## 7. Cómo seguir trabajando (recomendación de orden)

1. Si vas a tocar pagos, caja o métricas: lee §3 y corre `npm run verificar` antes
   y después. El bloque 16 es tu red.
2. Si agregas un método de pago: actualiza `METODOS_PAGO`,
   `METODOS_PAGO_LABEL`, el check constraint de `cuenta_pagos.cuenta_pago` en
   `supabase/rpc_cerrar_cuenta.sql` y `supabase/caja_turnos.sql` si aplica.
3. Si cambias un cálculo de dinero, la función pura va en `src/lib/*.ts` con su
   check, no dentro del componente.
4. Si agregas un método al `DataApi`, impleméntalo en `realApi` **y** en
   `crearApiDesde`, o el typecheck te va a avisar pero el demo quedará roto.
5. SQL: el orden de aplicación **ya está escrito y verificado**: `SUPABASE_SETUP.md`
   §2 lo explica y `npm run sql:install` concatena los **19** archivos en
   `supabase/TODO_EN_UNO.sql` (y falla si un `.sql` nuevo no está en la lista). El orden
   es: `00_schema_base` → `00_seguridad_rpcs` → `migracion_items_anulables` →
   `migracion_productos_es_bebida` → `migracion_password_recovery` →
   `pin_autorizacion` → `rpc_crear_pedido` →
   `rpc_cerrar_cuenta` (crea `cuenta_pagos`) → `rpc_anular_cuenta` → `caja_turnos`
   → **`01_rls_completo`** → `admin_super_restaurante` → `usuarios_super_admin` →
   `estadisticas_super_admin` → `soporte` → `suscripciones_super_admin` →
   `auditoria` → `configuracion_global` → `99_crear_usuario_prueba`. Por qué:
   `00_seguridad_rpcs` va al principio porque todas las RPC invocan
   `validar_acceso_restaurante`; `pin_autorizacion` va antes de las RPC de
   anulación porque ellas llaman a `validar_pin_autorizacion`;
   `rpc_cerrar_cuenta` va antes de `rpc_anular_cuenta` porque crea `cuenta_pagos`;
   los 7 módulos de Super Admin van **después** de `01_rls_completo` porque sus
   policies usan `soy_super_admin()` (definida ahí); `suscripciones` va antes de
   `auditoria` (que dispara triggers sobre `suscripciones_historial`), y `soporte`
   + `auditoria` van antes de `configuracion_global` (que consulta
   `soporte_tickets` e inserta en `audit_logs`).
   **Si agregas un `.sql` a `supabase/`, agregalo también a la lista `ORDEN` de
   `scripts/build-install-sql.mjs`.**
6. Si agregas una tabla nueva: créala en el archivo que corresponda y luego agrega
   su `alter table ... enable row level security`, sus policies y sus
   `grant`/`revoke`. Para las tablas base, ese lugar es `01_rls_completo.sql`; los
   módulos de Super Admin ya viven cada uno en su archivo y agregan sus propias
   policies junto a su tabla (ver §4.12).
7. Si agregas una RPC que escriba datos, la primera línea de su `begin` tiene que
   ser `perform public.validar_acceso_restaurante(p_restaurante_id);`. Si además
   cobra o reserva algo que no se pueda repetir, necesita su propio lock (ver §4.10).
8. Si agregas un método al backend local que escriba, ponle el guard de
   `errorDeAcceso` si tiene equivalente en una RPC, para que local y producción
   no diverjan.
9. Si agregas una operación sensible (anula, devuelve, descuenta): valida rol **y**
   PIN en las tres capas (SQL, `crearApiDesde`, UI). Que la UI la esconda no
   alcanza; el rol es la autorización y el PIN es la conformidad.

---

## 8. Pendientes (contexto para tomarlos)

| # | Pendiente | Dónde | Nota |
| --- | --- | --- | --- |
| 1 | Recuperación tras fallo de red en el cobro | `CerrarCuenta.tsx` | Si el servidor cerró la cuenta pero la respuesta se perdió, la UI muestra error y el mesero puede cobrar dos veces. Falta reconciliar por pedido/cuenta. |
| 2 | Número correlativo real de boleta | `supabase/fuentes/rpc_cerrar_cuenta.sql` | **RESUELTO**: `cerrar_cuenta` toma el siguiente número de `correlativos` por restaurante con lock; `boleta.ts` solo deriva un número del UUID para cuentas históricas sin `numero`. |
| 3 | Focus trap completo del modal | `src/components/ui.tsx` | Falta retener el foco con Tab y devolverlo al abrir. |
| 4 | Impresión de la comanda de cocina | `src/pages/cocina/Cocina.tsx` | Falta el ticket de cocina (varios tickets de 80 mm). Hay `no-print` y CSS listos. |
| 5 | Supabase Auth en personal | `api.ts` `crearPersonal` | **RESUELTO** (ver §4.15): ahora crea el usuario de Auth vía la Edge Function `crear-personal` (desplegada y `ACTIVE`), con contraseña inicial que define el admin. |
| 6 | README al día | `README.md` | **RESUELTO**: cubre modos, scripts, schema, seguridad y despliegue; `SUPABASE_SETUP.md` tiene el paso a paso. |
| 7 | Persistencia del demo | `reiniciarDemoDatos` | **RESUELTO**: el demo persiste en `localStorage`; "Vaciar el demo" lo reinicia. El texto de la guía ya lo dice. |
| 8 | Config de Auth en consola Supabase | Dashboard → Authentication → URL Configuration | Allow-listear `<origin>/restablecer` en Redirect URLs y configurar el correo de recuperación para que funcione el «¿Olvidaste tu contraseña?» (§4.15). No se puede hacer por CLI. |
| 9 | Reconciliación de la caja al cerrar | `CajaTab.tsx` / `api.ts` | **RESUELTO**: el cierre ya no se bloquea por mesas sin cobrar; el aviso muestra mesas y montos y el arqueo solo suma el efectivo cobrado en el turno. |
| 10 | Responsive y aspecto | `src/pages/**` | **RESUELTO**: 332 checks en 360/390/768/1280 px; se corrigieron desbordes del dashboard, el `sr-only` que ensanchaba tablas y los controles táctiles de menos de 28 px. |

---

## 9. Riesgos conocidos / límites

1. **El SQL se validó estáticamente; no hay prueba de integración.** El repo
   genera `TODO_EN_UNO.sql` y comprueba delimitadores, encoding, orden y
   cobertura, pero ningún comando lo ejecuta contra un Postgres desde CI. En el
   proyecto real (`yyfsewgxyyqjyzcejsqq`) las 19 tablas existen (la anon key
   recibe 401, no 404), pero **no se ha hecho el recorrido funcional completo**
   contra esa base: eso queda en el checklist de `SUPABASE_SETUP.md` §8.
2. **El bloqueo de suscripción y `usuarios.activo` se puede bypasear** llamando la
   RPC directamente. Falta una política/función que lo compruebe de verdad.
   **RESUELTO** (ver §4.10): ahora `validar_acceso_restaurante` se ejecuta en SQL
   al inicio de las seis RPC que escriben datos.
3. **Concurrencia de cobro**: la RPC `cerrar_cuenta` filtra por
   `cuenta_pedidos` + `estado='pagada'`, pero sin constraint único o lock puede
   haber doble cobro si dos terminals cobran a la vez. La caja ya usa
   `for update`; el cobro debería hacer lo mismo.
   **RESUELTO** (ver §4.10): `cerrar_cuenta` toma `for update` sobre la mesa antes
   del chequeo de "ya cobrado", y el backend local serializa por mesa igual.
4. **Las cuentas viejas** (sin `cuenta_pagos`) caen al método principal: el
   dashboard y el arqueo siguen funcionando, pero el desglose por método de esas
   cuentas es referencial, no exacto.
5. **Build**: resuelto con code-splitting por ruta. El entry queda en ~401 kB
   (120 kB gzip) y React en un chunk compartido de 311 kB; el panel, el PDF y
   cada módulo de super admin se descargan solo al entrar. Vite puede seguir
   avisando de algún chunk > 500 kB si se le añaden dependencias pesadas.
6. **Documentación**: `README.md` y `SUPABASE_SETUP.md` están al día con el
   estado real; este documento sigue siendo la referencia de decisiones.
7. **Escrituras que no pasan por RPC.** El guard de §4.10 cubría las seis
   funciones de `supabase/`, pero las escrituras directas que hace `realApi` desde
   el navegador (catálogo, personal, `avanzarPedido`, `liberarMesa`) dependían solo
   de policies que no estaban escritas en el repo.
   **RESUELTO** (ver §4.12): las 13 tablas base (y, aparte, las tablas propias de
   los módulos de Super Admin: `planes`, `suscripciones_historial`,
   `soporte_tickets`, `audit_logs`, `configuracion_global`) tienen RLS y toda
   escritura directa exige usuario activo + restaurante propio + rol + suscripción
   vigente.
   Queda un límite real: **RLS no filtra columnas**, así que el `update` de
   `mesas` que habilita al mesero (para `liberarMesa`) también le permitiría
   renombrar la mesa o cambiarle la zona, y el `update` de `pedidos` que habilita
   a cocina/mesero/admin (para `avanzarPedido`) también les permite cambiar
   `mesero_id` o saltar estados. El arreglo limpio es mover esas dos operaciones a
   RPC (`liberar_mesa`, `avanzar_pedido` con compare-and-set) y no se hizo ahora
   porque exigiría tocar el frontend. No es dinero ni documento, pero está anotado.
8. **El efectivo del turno está escrito dos veces**: en `ventasEfectivoDelTurno`
   (`src/lib/caja.ts`) y en el CTE de `supabase/caja_turnos.sql`. Hoy coinciden
   (el bloque 19 lo cubre), pero cualquier cambio en uno tiene que cambiar al otro.
9. **`getCuentasDelDia` (real) trae las últimas 200 boletas.** En un local con
   más de 200 cobros el día, la pantalla de cobros no los muestra todos. El listado
   es de revisión, no de contabilidad: para el total del día están las métricas.
10. **`supabase/pin_autorizacion.sql` y `supabase/rpc_anular_cuenta.sql` no se
    ejecutaron nunca.** Es lo mismo que el punto 1, pero conviene recordarlo
    porque son los que deciden quién puede sacar plata de la gaveta. La validación
    del rol y del PIN está probada contra el backend local, no contra Postgres.
11. **El hash del PIN se compara en SQL, pero el PIN viaja en claro por la red**
    en cada anulación. Con HTTPS no es problema; sin él, cualquiera que snifee la
    sesión ve el PIN de 4–6 dígitos. Mitigación futura: desafío firmado con
    expiración corta en vez de mandar el PIN en cada llamada.
12. **El schema base está en el repo pero es una reconstrucción, no un volcado.**
    `supabase/fuentes/00_schema_base.sql` (32 KB) crea las 11 tablas del dominio
    (8 base + `cuentas`, `cuenta_pedidos` y `correlativos`) a partir de
    `src/types/database.ts` y de lo que los SQL y `realApi` usan. Se restauró el
    archivo completo desde la copia huérfana `00_schema_base.broken.sql` porque la
    versión anterior estaba truncada a 7 KB y no creaba `cuentas` ni
    `cuenta_pedidos`. Es lo que hay que ejecutar para una base nueva, pero **si
    algún día se migra una base que ya existe, hay que comparar ese archivo contra
    el `information_schema` real antes de confiar en él**: columnas que sobren,
    defaults distintos o un tipo de `numeric` más corto cambian el comportamiento
    del cobro.
13. **`Restaurante.pin_autorizacion` sigue en el tipo de TypeScript** pero ya no
    corresponde a una columna: el hash vive en `restaurante_pins`, que el cliente no
    puede leer (policy inexistente a propósito). El backend local conserva el campo
    por compatibilidad; contra Supabase hay que usar `tienePinAutorizacion`. No se
    tocó el tipo para no romper el modo local en esta tanda.
14. **`productos.disponible` no se puede esconder con RLS** de forma útil: el menú
    del mesero filtra en el navegador, así que quien quiera ver los agotados puede
    pedirlos con la misma consulta. Es información de catálogo, no dinero. Si
    importa, hace falta una vista o una RPC con filtro.

---

## 10. Cierre 2026-10-22: qué cambió en esta tanda

Resumen de lo tocado para dejar el proyecto publicable. Todo está verificado por
las suites del encabezado.

### 10.1 Demo: "Hazlo por mí" vuelve a escribir

- `MesasZonasTab` y `MenuTab` esperan a que la pantalla termine de cargar
  (`!cargando`) antes de rellenar; antes el prefill se ejecutaba sobre campos que
  todavía no existían y no pasaba nada.
- La escritura es **progresiva y visible** (`escribirSecuencia`), con anillo en el
  campo activo y el mensaje "Mesora está escribiendo por ti…".
- `PREFILL_GUIA` actúa de respaldo cuando `prefillGuia` es `false` (caso F5: el
  recorrido persiste pero el flag no). `GuiaDemo.sondear` reactiva el flag y la
  burbuja minimizada no tapa los campos mientras se escribe.
- El demo **persiste** en `localStorage`; el texto que decía "un F5 reinicia el
  demo" era falso y se corrigió.

### 10.2 Caja: cerrar turno ya no se bloquea

- Decisión: **una mesa sin cobrar no impide cerrar caja**. El arqueo solo suma el
  efectivo cobrado dentro del turno; lo impago entrará cuando se cobre. Bloquear
  dejaba al admin sin salida, porque para cobrar hay que ir a la vista de mesero.
- `errorAlCerrarTurno` ya no recibe `mesasOcupadas`.
- `getMesasPorCobrar(rid)` (nuevo en `DataApi`, `realApi` y backend local) lista
  mesas con pedidos no anulados y no cobrados, con su monto real. `CajaTab`
  muestra un aviso ámbar con mesas y total, y permite cerrar.
- La detección no depende de `mesas.estado` (que puede quedar desfasado): mira
  pedidos e ítems vigentes.

### 10.3 Schema reproducible y permisos

- Restaurado `00_schema_base.sql` completo (11 tablas).
- `01_rls_completo.sql`: `revoke all on public.correlativos from anon` y
  `revoke truncate` en las tablas administrables (truncate no pasa por RLS).
- `configuracion_global.sql`: `anon` ya no puede leer la fila entera; solo
  `nombre_app` y `precio_plan_mensual` por **grant de columna**. `authenticated`
  solo puede actualizar las columnas editables (no `id`/`updated_by`).
- `TODO_EN_UNO.sql` regenerado: 19 archivos, 238 788 bytes.

### 10.4 Rendimiento y responsive

- `App.tsx`: code-splitting por ruta con `route.lazy`; el entry baja de ~1.35 MB
  a ~401 kB (120 kB gzip).
- `scripts/verificar-responsive.mjs` (nuevo, `npm run verificar:responsive`):
  332 checks en 360/390/768/1280 px sobre landing, login, demo, las 8 pestañas
  del admin, mesero, cocina, cajero (con turno abierto y cierre) y las 10
  secciones del super admin con datos.
- Corregido: glow del Hero que sobresalía 8 px, `sr-only` dentro de tablas
  anchas que ensanchaba el documento (`.overflow-x-auto { position: relative }`),
  cards del dashboard sin `min-w-0`, y controles táctiles de 16–26 px en login y
  personal.

### 10.5 Documentación

- Nuevo `SUPABASE_SETUP.md`: proyecto, SQL, usuarios, variables, Edge Functions,
  Auth, verificación, errores frecuentes y checklist de publicación.
- `README.md` actualizado (modos, scripts, schema, roles, estructura, estado).
- `.gitignore`: `capturas/`, `.env.local`, `.env.local.pausa-*`, `_*.txt`,
  `vite-*.log`.

---

## Actualización de auditoría — 2026-10-24

- El modo de autenticación local queda restringido a desarrollo. Un build de producción sin credenciales de Supabase bloquea el login local y no muestra las credenciales de prueba en la interfaz.
- Los errores al restaurar sesión o cargar el perfil se muestran en el login con un mensaje recuperable; se verifican los errores devueltos por Supabase en lugar de ignorarlos.
- El límite global de errores muestra un mensaje genérico y registra el detalle técnico solo en la consola durante desarrollo, sin mostrar el mensaje interno en pantalla.
- Se añadió `.github/workflows/ci.yml` para instalar dependencias y ejecutar typecheck/build en pull requests y pushes a `main`/`master`. Debe quedar en la raíz del repositorio GitHub para activarse.
- La verificación registrada arriba corresponde al 2026-10-22. Esta actualización no afirma haber vuelto a correr esas suites.
- Pendiente de infraestructura: Git informa `C:/Users/benja` como raíz del repositorio local. No se cambió ese repositorio porque incluye archivos ajenos a Mesora; antes de publicar, crear/seleccionar un repositorio dedicado cuya raíz sea esta carpeta.
- `tmp_rest.txt` queda sin tocar porque está abierto en el IDE; parece un volcado SQL parcial y conviene confirmar su propósito antes de retirarlo.