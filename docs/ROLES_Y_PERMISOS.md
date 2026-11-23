# Roles y permisos

Los roles definen el panel inicial y las operaciones permitidas. RLS, RPC y validaciones del backend son la autoridad final. Ocultar un botón en la interfaz no concede ni revoca permisos.

## Matriz de capacidades

| Rol | Ámbito | Capacidades principales | Límites importantes |
| --- | --- | --- | --- |
| `super_admin` | Plataforma | Administrar restaurantes, suscripciones, usuarios de plataforma, soporte, notificaciones, configuración global y auditoría. | No es un rol de turno ni reemplaza la cuenta del restaurante. |
| `admin_restaurante` | Un restaurante | Gestionar mesas, zonas, menú, personal, configuración operativa, reportes, caja/cobros permitidos, soporte y auditoría de su local. | Los datos y cambios se limitan al restaurante de la sesión. El uso administrativo de cobro de contingencia queda auditado. |
| `mesero` | Un restaurante | Ver mesas asignadas al ámbito permitido, crear y ampliar comandas, revisar precuenta y ejecutar operaciones de mesa habilitadas. | Cobrar solo si la modalidad y la autorización individual lo permiten. Transferencias, traslados y anulaciones respetan las confirmaciones existentes. |
| `cajero` | Un restaurante | Abrir y cerrar turno, revisar arqueo y cobrar cuentas cuando esté autorizado. | No administra personal, menú ni configuración operativa. No puede operar fuera del restaurante. |
| `cocina` | Un restaurante y sus estaciones | Consultar comandas de Cocina/Barra/Otros según configuración y avanzar su preparación. | Nunca cobra ni modifica pagos, caja o cuentas. |

Barra es una estación que se selecciona dentro de `/cocina`; no es un rol distinto. Los roles de aplicación no deben confundirse con permisos SQL de Supabase.

## Modalidad de cobro

La configuración determina quién puede cobrar cuentas nuevas:

1. **Solo caja:** únicamente los cajeros activos seleccionados pueden cobrar.
2. **Meseros autorizados:** solo los meseros activos seleccionados pueden cobrar.
3. **Caja central con meseros autorizados:** cobran los cajeros activos seleccionados y los meseros activos seleccionados.

Una persona debe estar activa y pertenecer al restaurante. Cocina, usuarios inactivos y personas no seleccionadas no pueden cobrar. El administrador conserva la contingencia administrativa definida por el sistema; su uso debe quedar auditado. Cambiar la modalidad no reescribe pagos ni recibos históricos.

## Controles de seguridad

- Autenticación con Supabase Auth en el entorno real.
- Rutas protegidas por rol y sesión.
- Aislamiento multi-restaurante en consultas y políticas RLS.
- Las acciones críticas se validan otra vez en RPC/backend.
- Las operaciones sensibles conservan actor, tiempo, motivo y referencias cuando corresponde.
- Los usuarios inactivos no deben operar.
- Las claves de servidor y `service_role` nunca pertenecen al frontend, README, capturas o repositorio.

## Rutas de trabajo

| Rol | Ruta |
| --- | --- |
| Superadmin | `/super-admin` |
| Admin Restaurante | `/admin` |
| Mesero | `/mesero` |
| Cocina y estaciones | `/cocina` |
| Cajero | `/cajero` |

Las rutas no son una garantía de autorización por sí solas; la API debe comprobar el rol y el tenant de cada operación.
