# Checklist ejecutable del piloto Mesora

Este checklist se usa en la futura ventana de publicación y en el primer turno del restaurante. La Fase 7 solo ejecuta verificaciones locales: los apartados **remoto** y **físico** quedan pendientes hasta realizarlos y guardar evidencia. No marcar una prueba física como aprobada por el resultado del adaptador simulado.

## Registro de ejecución

- Restaurante y `restaurante_id`: ____________________
- Fecha, horario y responsable del turno: ____________________
- Proyecto Supabase esperado: `yyfsewgxyyqjyzcejsqq`; referencia observada: ____________________
- Commit del frontend y versión de migraciones observados: ____________________
- Equipo Windows, agentes, colas y anchos de papel: ____________________
- Dispositivos y cuentas por rol utilizados: ____________________
- Resultado global: [ ] aprobado  [ ] bloqueado  [ ] revertido
- Incidentes, IDs de pedido/comanda/trabajo y evidencia guardada fuera del repositorio: ____________________

Para cada casilla anotar **hora, operador, resultado, ID y evidencia**. Evitar capturar contraseñas, PIN, tokens, datos de pago o clientes reales en los archivos compartidos.

## 1. Preparación y recuperación — remoto controlado

- [ ] Acordar ventana sin escrituras, responsable, criterio de pausa, retención y ubicación segura del respaldo.
- [ ] Crear respaldo nuevo antes de migrar; verificar hash, cifrado y copia fuera de la computadora del local. La clave se guarda separada de OneDrive.
- [ ] Restaurar el respaldo en un entorno aislado compatible. Contar tablas, funciones, RLS, usuarios Auth y datos de prueba; conservar acta y hash. No borrar el respaldo local hasta confirmar la restauración.
- [ ] Confirmar referencia del proyecto remoto y comparar `supabase migration list --linked` con el orden de [RELEASE_CANDIDATE_FASE7.md](RELEASE_CANDIDATE_FASE7.md). Ejecutar `supabase db push --linked --skip-vault --dry-run`; detenerse ante migraciones inesperadas.
- [ ] En la ventana autorizada, aplicar las migraciones pendientes en orden y guardar el resultado. Confirmar que las de Fases 2–6 constan en historial; no instalar `TODO_EN_UNO.sql` sobre producción migrada.
- [ ] Ejecutar SQL QA remoto y comprobar RPC, permisos de ejecución, RLS de configuración/KDS/cola/agentes, aislamiento de dos restaurantes y ausencia de acceso `anon`.
- [ ] Verificar cuentas `admin_restaurante`, mesero, cocina/bar y cajero. Cada cuenta debe ver solo lo permitido en su restaurante; intentar acceso cruzado y registrar rechazo sin compartir credenciales.

## 2. Comandas y KDS — automatizada local y remoto controlado

- [ ] Pedido solo Cocina: producto correcto, una comanda, snapshot de destino, estado independiente y auditoría. ID: __________
- [ ] Pedido solo Barra: producto correcto, una comanda, snapshot de destino, estado independiente y auditoría. ID: __________
- [ ] Pedido mixto: Cocina ve solo Cocina, Barra solo Barra; avanzar `pendiente → en preparación → listo → entregado` en un área no cambia la otra. ID: __________
- [ ] Probar cada modalidad: solo KDS, solo impresora, ambos y sin salida. En “sin salida” permanecen pedido, ítems y auditoría sin entrega operativa.
- [ ] Cambiar la configuración después del pedido y confirmar que sus destinos históricos no cambian. Crear un pedido nuevo y comprobar la nueva ruta.
- [ ] Rechazo atómico, anulación de ítem y reintento idempotente: confirmar una sola mutación y una sola auditoría. No repetir una operación cuyo resultado sea incierto sin conciliarla primero.

## 3. Impresión — distinguir simulación de papel real

**Automatizada local (CI):** [ ] `verificar:impresion` aprobado  [ ] `verificar:agente` con adaptador simulado aprobado. Registrar fecha y salida: __________. Estas comprobaciones no certifican ticketera, controlador ni papel.

**Física en Windows con operador presente:**

- [ ] Identificar en Windows el nombre exacto de cada cola autorizada; asociar Cocina y Barra por separado y comprobar que no se intercambien.
- [ ] Imprimir manualmente ticket de Cocina y de Barra en **58 mm** y **80 mm** según equipo disponible: una sola copia lógica, ancho, cantidades, observaciones, tildes, comillas, corte y legibilidad. Si falta un ancho, dejarlo bloqueado.
- [ ] Solicitar reimpresión manual con motivo; verificar auditoría y que no aparece una segunda comanda/pedido. Probar doble clic sobre “Imprimir”.
- [ ] Vincular el agente con código temporal, verificar caducidad y uso único; registrar último heartbeat sin registrar código/token.
- [ ] Ejecutar impresión de prueba explícita y pedido real de Cocina, Barra y mixto. Registrar ID de trabajo, impresora, intento, estado `enviado` y **papel observado** por el operador.
- [ ] Probar copias y ancho del snapshot histórico; cambiar configuración y comprobar que el pedido antiguo conserva su destino original.
- [ ] Detener el agente antes de reclamar un trabajo: verificar pendiente/lease/reintento y reanudar sin duplicar la entrega a cola.
- [ ] Simular pérdida de conexión antes del envío y después de un envío incierto. Conciliar la cola de Windows y el papel antes de reintentar; no afirmar impresión física basándose solo en `enviado`.
- [ ] Revocar el agente y comprobar que ya no reclama ni confirma trabajos. Revisar trabajos fallidos y conservar su error final.
- [ ] Comprobar que la impresora de respaldo KDS automática sigue **desactivada**. Cualquier respaldo se realiza manualmente con decisión humana.

## 4. Operación del turno — físico con personal del local

- [ ] Con al menos dos dispositivos, registrar pedido, preparación, entrega y precuenta; comparar pantalla, ticket y cuenta.
- [ ] Anular un ítem y una cuenta cobrada con los PIN correspondientes; confirmar motivo, estados y una auditoría por acción.
- [ ] Cobrar con los roles hoy autorizados, verificar importes, propina, comprobante y reimpresión permitida. No probar permisos de cobro futuros como si estuvieran activos.
- [ ] Cerrar caja, conciliar efectivo/otros medios, ventas/anulaciones y reporte; guardar diferencias e incidencias.
- [ ] Probar contingencia por pérdida de internet: detener operaciones de resultado incierto, reconectar y conciliar antes de reintentar. Verificar mensajes de estado y ausencia de pedidos duplicados.

## 5. Decisión y reversión — remoto controlado

- [ ] Registrar aprobado/bloqueado por cada prueba, incidencias, responsable y decisión de continuar o revertir.
- [ ] Ensayar la reversión sin borrar datos: detener/revocar agentes, desactivar asignaciones de impresión y usar KDS o impresión manual. Verificar trabajos pendientes/reclamados/enviados con la cola física antes de reimprimir.
- [ ] Si se necesita restaurar, congelar escrituras, conservar el estado actual y ensayar primero en proyecto aislado. Cuantificar transacciones posteriores al respaldo; acordar corte y pérdida máxima admisible antes de una restauración productiva.
- [ ] Autorizar publicación solo tras migraciones, RLS, impresión física, turno y recuperación aprobados. Anotar firmantes y fecha: ____________________

La secuencia de migraciones, el procedimiento de reversión y los límites de la impresión están en [RELEASE_CANDIDATE_FASE7.md](RELEASE_CANDIDATE_FASE7.md). La operación de respaldo y restauración se detalla en [RESPALDOS.md](RESPALDOS.md).
