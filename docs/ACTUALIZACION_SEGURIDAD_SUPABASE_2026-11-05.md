# Revisión de seguridad de Supabase

Fecha: 05/11/2026. Revisión del catálogo y avisos del proyecto desplegado,
seguida de dos correcciones de base de datos. No sustituye una auditoría
independiente ni una prueba de penetración.

## Resumen de hallazgos

- El asesor de Supabase reportó 35 funciones `SECURITY DEFINER` invocables por
  `authenticated` y ninguna de ese grupo invocable por `anon`. Las 35 tienen
  `search_path` fijado. `anon` y `authenticated` no pueden crear objetos en
  `public`. La advertencia sigue requiriendo revisar cada función y su control
  de rol/restaurante; no se revocaron todas porque el producto usa RPC para
  pedidos, caja, soporte y administración.
- El asesor reportó 9 tablas con RLS activo y sin políticas: siete tablas
  internas del esquema `private`, más `public.correlativos` y
  `public.restaurante_pins`. Las siete tablas privadas no conceden acceso de
  tabla a `anon` ni a `authenticated`. Las dos tablas públicas sí conservaban
  grants directos aunque RLS las dejaba sin filas accesibles; se revocaron en
  la migración `20261105050911` como defensa adicional.
- Supabase mantiene activa la alerta de protección contra contraseñas filtradas
  deshabilitada. El asesor de seguridad también reporta 19 índices sin uso
  observado; no se quitaron, porque la métrica no demuestra que sean
  prescindibles para el flujo de producción.
- La organización de Supabase figura en el plan Free. La guía indica que la
  protección contra contraseñas filtradas se ofrece en Pro y superiores, por lo
  que no se activó ni se generó un cambio de plan o costo.

## Correcciones aplicadas en producción

1. **Autoría del historial de suscripciones (`20261105050740`).** Las RPC
   aceptaban `p_creado_por` enviado por el navegador. Se instaló un trigger que,
   cuando hay sesión autenticada, reemplaza ese dato por `auth.uid()`. Las
   firmas se conservaron para no romper versiones desplegadas. El trigger es
   `SECURITY INVOKER`, fija `search_path = pg_catalog` y no se puede invocar
   directamente por `anon` o `authenticated`.
2. **Acceso directo a tablas internas (`20261105050911`).** Se revocaron todos
   los privilegios de tabla de `anon` y `authenticated` en `correlativos` y
   `restaurante_pins`. La app accede a esos datos por RPC privilegiadas; no
   necesita leer esas tablas directamente.

Las dos migraciones aparecen en el historial de Supabase. Se consultaron el
trigger, su definición, su configuración y los permisos después de aplicarlas.
También se confirmó que ambos roles ya no tienen `SELECT`, `INSERT`, `UPDATE` ni
`DELETE` directo en las dos tablas internas. No se insertaron registros de
prueba en producción.

El asesor aún muestra las 9 alertas informativas de RLS sin políticas: las dos
tablas públicas permanecen con acceso denegado intencionalmente, ahora también
sin grants directos. No se agregaron políticas solo para ocultar el aviso.

## Pendientes de seguridad

1. Habilitar **Leaked Password Protection** en Authentication → Settings →
   Password después de cambiar a un plan que la incluya. Supabase documenta la opción en su [guía de
   seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
   e indica que está disponible en planes Pro y superiores.
2. Revisar individualmente las funciones `SECURITY DEFINER`: comprobar
   identidad, rol, alcance por restaurante, argumentos y grants. Mantener
   `search_path` fijado y mover fuera del esquema expuesto las funciones
   auxiliares que no deban formar parte de la API RPC.
3. Volver a revisar los avisos de Supabase tras una ventana de uso
   representativa. Los índices marcados sin uso pueden requerir más actividad
   antes de decidir si se conservan.

La guía oficial recomienda preferir `SECURITY INVOKER` cuando basta y, si se
requiere `SECURITY DEFINER`, restringir su ejecución y validar el acceso en el
cuerpo. Ver [Database Functions](https://supabase.com/docs/guides/database/functions).

## Revisión adicional de funciones — 05/11/2026

La revisión de catálogo encontró 52 funciones `SECURITY DEFINER` en `public`;
52 fijan `search_path`, 35 son ejecutables por `authenticated` y ninguna por
`anon`. Esas 35 incluyen las RPC operativas y helpers que necesita RLS, por lo
que no se revocaron en bloque.

Se encontró y cerró una consulta cruzada concreta: `suscripcion_vigente(uuid)`
permitía a cualquier sesión autenticada consultar el estado de una suscripción
si conocía el UUID del restaurante. La migración
`20261105055856_limitar_consulta_vigencia_suscripcion` limita el resultado al
superadmin o a una cuenta activa del restaurante consultado. El permiso de
ejecución se conserva porque las policies de escritura necesitan el helper.
La matriz local confirma que Admin A ve su estado, no ve el estado de B y Admin
B solo ve el suyo. La misma migración quedó registrada en el historial del
proyecto; la definición, `search_path`, permisos y ausencia de ejecución por
`anon` se comprobaron después de aplicarla.

Supabase aún muestra 35 advertencias de `SECURITY DEFINER` ejecutables por
`authenticated`; son un aviso de revisión de cada RPC y no implican por sí
solas que sean accesibles sin sesión o sin validación. Se mantienen también las
nueve alertas informativas de RLS sin policies en tablas deliberadamente
cerradas y el aviso de protección de contraseñas filtradas, que requiere un
plan compatible.
