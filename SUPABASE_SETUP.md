→# Instalar Mesora sobre Supabase

Guía para pasar del modo local/demo a una base **real** de Supabase y dejarla
lista para publicar. Son cinco pasos y no hace falta Docker ni la CLI: todo se
hace desde el panel web y el SQL Editor.

> Tiempo estimado: 15→20 minutos la primera vez.
>
> Al terminar tendrás: base con RLS, 5 usuarios de prueba, la app conectada y el
> primer administrador con el que entrar.

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

Ese comando concatena los 19 archivos en el orden correcto, comprueba los
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
- al final ejecuta `99_crear_usuario_prueba.sql`, que **avisa** de que todavía no
  existen los usuarios de Auth. Es normal: el paso 3 los crea.

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

## 3. Crear los usuarios de prueba

Los perfiles de negocio (`public.usuarios`) **no** se crean a mano: cada fila se
enlaza por `id` con un usuario real de Supabase Auth. Si creas la fila sin el
usuario de Auth, ese correo no puede iniciar sesión.

En **Authentication →  Users →  Add user**, crea estos cinco correos con la
casilla **Auto Confirm User** marcada y la misma contraseña (por ejemplo
`Mesora2026!`):

| Correo | Rol que tendrá |
| --- | --- |
| `super@prueba.app` | super admin de la plataforma |
| `admin@prueba.app` | administrador del restaurante |
| `mesero@prueba.app` | mesero |
| `cocina@prueba.app` | cocina/barra |
| `cajero@prueba.app` | cajero |

Después, vuelve al SQL Editor y pega **solo**
`supabase/fuentes/99_crear_usuario_prueba.sql` (o todo `TODO_EN_UNO.sql` otra
vez). Crea el restaurante "Restaurante de Prueba" y enlaza los cinco perfiles.
La consulta final te dice cuáles quedaron con `existe_en_auth = true`.

> El `super_admin` va con `restaurante_id = null` a propósito: administra la
> plataforma desde fuera y no opera dentro de un local.

Si prefieres usar tus correos reales, edita el bloque `values` de ese archivo
antes de ejecutarlo.

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

Reinicia el servidor (`npm run dev`) y entra a `/login` con
`admin@prueba.app`. Si en lugar del login ves el aviso de modo local, es que
Vite no leyó `.env.local`: para el proceso y vuelve a arrancarlo (las variables
`VITE_*` se inyectan al iniciar).

> Sin `.env.local` la app usa el backend local simulado. Eso es intencional:
> permite desarrollar sin red y sin tocar la base real.

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

1. Entra como `admin@prueba.app` →  verás el panel de administración.
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

Las suites `verificar` y `verificar:responsive` **no** necesitan Supabase: usan el
backend local y apartan `.env.local` mientras corren. Son la red de seguridad de
las reglas de negocio y del layout, no un test de integración contra Postgres.

Contra la base real, la comprobación es manual y corta:

1. Login de los cinco roles.
2. Una comanda de principio a fin y su boleta.
3. Anular un ítem y ver que deja de sumar en la cuenta.
4. Abrir y cerrar caja con mesas pendientes (debe avisar, no bloquear).
5. Recargar (F5) en cada vista: la sesión debe persistir.

---

## 9. Errores frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| "Email not confirmed" | El usuario se creó sin *Auto Confirm*. Confírmalo en Authentication →  Users o desactiva *Confirm email*. |
| La app entra pero todo sale vacío | El usuario existe en Auth pero no en `public.usuarios`, o su `restaurante_id` no coincide. Revisa la consulta final del paso 3. |
| `401` / `permission denied for table ...` | Falta un `grant`, no una policy. Vuelve a correr `TODO_EN_UNO.sql` completo (incluye los grants de `01_rls_completo.sql`). |
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

## 11. Checklist de publicación

- [ ] `npm run sql:install` sin errores.
- [ ] `TODO_EN_UNO.sql` aplicado en el proyecto de producción.
- [ ] Cinco usuarios de Auth creados y enlazados (`existe_en_auth = true`).
- [ ] `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel.
- [ ] Site URL y Redirect URLs con el dominio final.
- [ ] SMTP propio configurado (si usas recuperación de contraseña).
- [ ] `npm run typecheck && npm run build` en verde.
- [ ] Recorrido manual de mesero →  cocina →  cajero →  admin.
- [ ] Datos de prueba borrados y restaurante real creado.
