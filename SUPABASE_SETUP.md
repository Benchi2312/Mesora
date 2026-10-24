→# Instalar Mesora sobre Supabase

Guía para pasar del modo local/demo a una base **real** de Supabase y dejarla
lista para publicar. Son cinco pasos y no hace falta Docker ni la CLI: todo se
hace desde el panel web y el SQL Editor.

> Tiempo estimado: 15→20 minutos la primera vez.
>
> Al terminar tendras la base protegida, un super administrador inicial y
> un restaurante piloto con sus cuentas de acceso.

---

## 0. Antes de empezar

| Necesitas | Dónde |
| --- | --- |
| Cuenta de Supabase | https://supabase.com |
| Node 20+ y el repo instalado | `npm install` |
| El SQL generado | `supabase/TODO_EN_UNO.sql` |

El SQL **no está escrito a mano**: se genera desde `supabase/fuentes/`.

```bash
npm run sql:install
```

Ese comando concatena los 19 archivos de produccion en el orden correcto, comprueba los
delimitadores `$$`, el encoding y que no haya ningún `drop table`, y deja
`supabase/TODO_EN_UNO.sql` listo para pegar. Si tocas cualquier archivo de
`supabase/fuentes/`, vuelve a ejecutarlo antes de instalar.

---

## 1. Crear el proyecto

1. En el panel de Supabase: **New project**.
2. Nombre: `mesora` (o el que quieras), contraseña de base de datos fuerte y
   guardada en un gestor de contraseñas.
3. Región: la más cercana a tus usuarios (para Perú, `South America (São Paulo)`
   o `US East`).
4. Espera a que el proyecto termine de aprovisionarse (~2 min).

Guarda estos dos datos de **Settings →  API**:

- **Project URL**: `https://<ref>.supabase.co`
- **anon public key**: la clave pública (en proyectos nuevos aparece como
  `sb_publishable_...`).

> La `anon key` está diseñada para viajar al navegador. Lo que protege los datos
> es RLS + los permisos de tabla, no el secreto de esa clave. **Nunca** pongas la
> `service_role` en el frontend ni en Vercel: esa sí salta RLS.

---

## 2. Aplicar el SQL

`supabase/TODO_EN_UNO.sql` sirve para instalar un proyecto nuevo. Si tu proyecto
ya tiene datos, no pegues el instalador completo: primero compara el esquema y
respalda la base. La mejora de piloto esta en `supabase/fuentes/seguridad_piloto.sql`;
aplicala por separado solo después de confirmar que el esquema actual ya tiene
las tablas y columnas que usa.

Para actualizar una instalación existente con la corrección de caja y anulaciones,
aplica en el SQL Editor estos fuentes, en este orden: `rpc_cerrar_cuenta.sql`,
`rpc_anular_cuenta.sql` y `caja_turnos.sql`. Esto agrega `cuenta_pagos.metodo_pago`
si falta, actualiza el cálculo de efectivo y limita los bloqueos al anular una
boleta. No hace falta volver a ejecutar el instalador completo.

Si el cambio de una contraseña temporal se guarda en Auth pero Mesora no puede
confirmarlo en el perfil, vuelve a ejecutar `migracion_password_recovery.sql`
desde el SQL Editor. Es idempotente e instala la RPC `confirmar_cambio_password`
que libera el acceso al cajero. Después, en la pantalla de restablecimiento,
pulsa **Reintentar confirmación**; no vuelvas a cambiar la contraseña.

1. Supabase →  **SQL Editor** →  **New query**.
2. Abre `supabase/TODO_EN_UNO.sql`, copia **todo** y pégalo.
3. **Run**. Tarda unos segundos y al final imprime varias tablas de verificación.

Qué hace, en orden:

- crea las 19 tablas del dominio (`restaurantes`, `usuarios`, `mesas`,
  `pedidos`, `cuentas`, `caja_turnos`, `correlativos`, `audit_logs`, etc.);
- define las RPC atómicas (`crear_pedido`, `cerrar_cuenta`, `abrir_turno_caja`⬦);
- activa RLS y crea las policies;
- revoca permisos peligrosos a `anon` y `truncate` a `authenticated`;
- siembra la configuración global y los planes;
No crea usuarios, perfiles de acceso ni datos de demostracion; el primer super administrador se configura en el paso 3.

El script es aditivo. En una base que ya contiene datos, respalda y revisa primero el impacto de cada cambio.

Es idempotente: se puede volver a ejecutar entero sin duplicar datos ni borrar
nada. Si algo falla a mitad, corrige y vuelve a correrlo.

### Comprobación rápida

En el mismo SQL Editor:

```sql
-- Deben salir 19 filas, todas con rls = true.
select tablename, rowsecurity as rls
  from pg_tables
 where schemaname = 'public'
 order by tablename;

-- La landing solo debe poder leer dos columnas de la configuración global.
select has_column_privilege('anon', 'public.configuracion_global', 'precio_plan_mensual', 'select') as precio_ok,
       has_column_privilege('anon', 'public.configuracion_global', 'correo_soporte', 'select')       as correo_ok;
-- Esperado: precio_ok = true, correo_ok = false
```

---

## 3. Preparar el acceso inicial

El instalador no crea usuarios, contraseñas compartidas ni datos de demostracion.
Primero conecta la app con las variables de Supabase del paso siguiente y despliega
las Edge Functions indicadas en el paso 5. Para habilitar el primer acceso de
plataforma, crea una cuenta Auth con tu correo y contraseña unica desde
**Authentication > Users > Add user** (marca **Auto Confirm User**). Despues
usa el SQL Editor para insertar su perfil de super administrador, sustituyendo
los valores por los tuyos:

```sql
insert into public.usuarios (id, restaurante_id, rol, nombre, email, activo)
select id, null, 'super_admin', 'Nombre del operador', email, true
  from auth.users
 where email = 'tu-correo@dominio.com'
on conflict (id) do nothing;
```

Limita este acceso a operadores de confianza. Desde ese panel crea el restaurante
piloto y su administrador; el sistema obliga a cambiar la contraseña inicial al
primer ingreso. No reutilices cuentas ni contraseñas de prueba en el piloto.

---

## 4. Conectar la app

### En tu máquina

```bash
cp .env.example .env.local
```

Rellena:

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Reinicia el servidor (`npm run dev`) y entra a `/login` con el correo del administrador piloto. Si aparece el aviso de Supabase sin configurar, revisa que `.env.local` tenga ambas variables y vuelve a iniciar Vite (las variables `VITE_*` se inyectan al arrancar).

> Si falta `.env.local`, el acceso real falla cerrado y la app no usa datos locales
> automáticamente. Para pruebas locales aisladas, habilita `VITE_MESORA_MODO_LOCAL=true`
> en desarrollo; esa opción no tiene efecto en producción.

### En Vercel

**Settings →  Environment Variables** (Production, Preview y Development):

| Nombre | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | tu anon/publishable key |

Después de añadirlas hay que **redeployar** (Deployments →  →9→ →  Redeploy): Vite
las incrusta en el build, no las lee en tiempo de ejecución.

---

## 5. Ajustes de Auth para producción

En **Authentication →  URL Configuration**:

- **Site URL**: `https://tu-dominio.com`
- **Redirect URLs**: añade `https://tu-dominio.com/restablecer` y, para probar,
  `http://localhost:5173/restablecer`.

El enlace de "¿Olvidaste tu contraseña?" manda al usuario a `/restablecer`, donde
la app detecta la sesión temporal de Supabase y permite fijar la nueva
contraseña.

En **Authentication →  Providers →  Email**:

- Deja **Enable email provider** activo.
- Mientras estés en pruebas, **Confirm email** desactivado (o marca *Auto
  Confirm* al crear cada usuario) para que el login funcione de inmediato.
- Para producción real, activa la confirmación de correo y configura un SMTP
  propio en **Project Settings →  Auth →  SMTP** (el SMTP compartido de Supabase
  tiene un límite muy bajo de correos por hora).

---

## 6. Desplegar las Edge Functions

Crear personal, crear restaurantes, crear usuarios y resetear contraseñas
necesitan la `service_role`, que nunca puede estar en el navegador. Por eso la
app llama a cuatro Edge Functions (`supabase/functions/`) que corren en el
servidor de Supabase y hacen la verificación de rol allí.

Sin desplegarlas, el alta de personal y de restaurantes falla con
`Failed to send a request to the Edge Function`.

### Opción  — CLI (recomendado)

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase functions deploy crear-personal crear-restaurante crear-usuario reset-password-personal
```

No hay que definir secretos a mano: Supabase inyecta `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en cada función. El despliegue
mantiene `verify_jwt = true`, que es justo lo que las funciones esperan (el
frontend manda el token de la sesión).

### Opción  — Dashboard

**Edge Functions →  Deploy a new function**, una por cada carpeta de
`supabase/functions/`, pegando su `index.ts`. Verifica que quede **Verify JWT**
activado.

Comprobación: en **Edge Functions →  Logs**, invoca "Personal →  Nuevo" desde el
panel del admin con datos de prueba. Debe responder 200 y crear el usuario en
Authentication.

---

## 7. Primer arranque: qué hacer dentro de la app

1. Entra como el correo del administrador piloto →  verás el panel de administración.
2. **Datos del local**: nombre real, RUC, dirección y teléfono.
3. **Mesas y zonas**: crea las zonas y mesas del salón.
4. **Menú**: categorías y productos (marca `es_bebida` en lo que prepare barra).
5. **Personal**: crea mesero, cocina y cajero. Esa pantalla crea el perfil; el
   usuario de Auth correspondiente se completa cuando esa persona inicia sesión
   o lo das de alta en Authentication.
6. Prueba el circuito completo: mesero toma una comanda →  cocina la avanza → 
   cajero abre turno →  cobra →  cierra caja.

Para borrar los datos de prueba antes de enseñar la app, elimina el restaurante
"Restaurante de Prueba" desde el **Super Admin** (o desde Table Editor) y crea el
tuyo desde la landing.

---

## 8. Verificación antes de publicar

```bash
npm run typecheck          # TypeScript sin errores
npm run verificar          # 500 checks de reglas de negocio (backend local)
npm run verificar:responsive  # 332 checks de layout en 360/390/768/1280 px
npm run build              # build de producción
npm run sql:install        # regenera TODO_EN_UNO.sql si tocaste el SQL
```

Las suites `verificar` y `verificar:responsive` **no** necesitan Supabase: usan un
entorno temporal aislado y fuerzan el backend local solo para QA. No mueven
`.env.local` ni cambian la configuración de servidores abiertos. Son la red de
seguridad de las reglas de negocio y del layout, no un test de integración contra
Postgres.

La aceptación contra la base de staging debe ser manual y con cuentas de prueba:

1. Iniciar sesión con cada rol piloto y confirmar que el administrador que entra
   desde /cajero llega al panel /admin.
2. Como mesero, crear una comanda; como cocina, avanzar sus estados hasta listo.
3. Abrir el turno de caja, cobrar la cuenta y verificar la boleta y el método de
   pago registrado.
4. Intentar anular con PIN incorrecto y confirmar que no cambie el estado; luego
   anular con PIN correcto y verificar motivo, actor, reembolso y estado anulada.
5. Cerrar el turno y comparar el efectivo esperado con la apertura, cobros y
   reembolsos de la ventana del turno.
6. Recargar cada vista y confirmar que la sesión persiste. Registrar tiempos y
   errores vistos en cada paso.
---

## 9. Errores frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| "Email not confirmed" | El usuario se creó sin *Auto Confirm*. Confírmalo en Authentication →  Users o desactiva *Confirm email*. |
| La app entra pero todo sale vacío | El usuario existe en Auth pero no en `public.usuarios`, o su `restaurante_id` no coincide. Revisa la consulta final del paso 3. |
| 401 / permission denied for table ... | Compara los grants y policies de la tabla con 01_rls_completo.sql y aplica la corrección puntual al esquema existente. No vuelvas a ejecutar el instalador completo sobre una base con datos. |
| `Invalid API key` | El valor de `VITE_SUPABASE_ANON_KEY` está incompleto o es la `service_role`. Copia la clave pública de Settings →  API. |
| Cambios de `.env.local` que no se aplican | Reinicia `npm run dev`; Vite solo lee las variables al arrancar. |
| El enlace de recuperación lleva a localhost | Falta la Redirect URL del dominio en Authentication →  URL Configuration. |
| La landing muestra el precio viejo | La landing lee `configuracion_global.precio_plan_mensual`; guárdalo en Super Admin →  Configuración y recarga. |
| Al recargar una ruta interna da 404 en producción | El hosting no reescribe a `index.html`. En Vercel lo hace `vercel.json`; en Netlify, `_redirects` con `/* /index.html 200`. |

---

## 10. Modelo de seguridad (lo que ya está puesto)

- **RLS activo en las 19 tablas.** Sin sesión, `anon` no ve filas de negocio.
- **Permisos de tabla revocados a `anon`** en todas las tablas del dominio, como
  segunda barrera por si alguien desactivara RLS por error.
- **`configuracion_global`** expone a `anon` solo `nombre_app` y
  `precio_plan_mensual` (grant por columna), que es lo que pinta la landing.
- **`correlativos`** no es legible desde el cliente: solo lo escribe la RPC
  `cerrar_cuenta` (`security definer`).
- **Operaciones atómicas por RPC**: crear pedido, editar/anular ítem, cerrar
  cuenta, caja y suscripciones. El precio y el total los resuelve Postgres, no el
  navegador.
- **`truncate` revocado** a `authenticated` en las tablas administrables:
  truncate no pasa por RLS.
- **El rol nunca se lee del frontend**: sale de `public.usuarios` y lo valida RLS.

Lo que **no** cubre este repo: rate limiting, WAF, backups automáticos y
monitorización. En Supabase, activa los backups del plan y revisa **Logs → 
API/Auth** tras el primer uso real.

---

## 11. Checklist previo al piloto

- [ ] Confirmar el proyecto de Supabase objetivo y que sea staging antes de
  ejecutar operaciones que creen pedidos, pagos, anulaciones o turnos.
- [ ] Hacer una copia de seguridad y confirmar cómo restaurarla.
- [ ] npm run sql:install termina sin errores y el diff generado está revisado.
- [ ] En una base existente, aplicar únicamente las migraciones pendientes, en
  el orden indicado en la sección 3. No pegar TODO_EN_UNO.sql sobre datos
  existentes: ese archivo es para una instalación nueva.
- [ ] Verificar en la base que cuenta_pagos.metodo_pago, las RPC de cierre y
  anulación y las RPC de caja estén presentes; confirmar PIN y permisos por rol.
- [ ] Crear el administrador y personal piloto con cuentas individuales; revisar
  restaurante_id, rol y activo en public.usuarios.
- [ ] Configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el hosting y
  Site URL/Redirect URLs de Supabase Auth para el dominio del piloto.
- [ ] Configurar SMTP propio si se habilitan invitaciones o recuperación de
  contraseña.
- [ ] npm run typecheck, npm run verificar,
  npm run verificar:responsive y npm run build pasan.
- [ ] Registrar una aceptación en staging: login de cada rol, pedido de mesero,
  avance de cocina, apertura de caja, cobro y boleta, anulación con PIN válido e
  inválido, cierre de caja y comprobación del arqueo.
- [ ] Confirmar el procedimiento manual de contingencia y quién revisará los
  logs durante el piloto.
- [ ] Desplegar el piloto solo después de completar y aprobar los puntos previos.
