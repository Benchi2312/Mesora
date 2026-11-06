# Estado del MVP de Mesora

Revisión: 06/11/2026. Versión técnica **0.1.0**.
Producto publicado en https://mesora-sistema.vercel.app.
Este registro distingue implementación, prueba técnica y aceptación del local.
Las suites aisladas no certifican un turno real ni la recepción de un correo.

## Alcance de la primera versión

Mesora coordina mesas, pedidos, cocina/barra, precuentas, cobros y turnos de caja.
Incluye personal por roles, ventas detalladas y superadministración. El demo
permite mostrar el recorrido sin modificar la base operativa. La facturación
electrónica permanece en el sistema actual del restaurante.

## Evidencia disponible

| Área | Estado comprobado | Evidencia y límite |
| --- | --- | --- |
| Publicación | GitHub público, rama `main` conectada a Vercel | Repo `Benchi2312/Mesora`. Vercel creó el despliegue de `main`; la promoción automática al alias comercial requiere corregir la comprobación de despliegue indicada abajo. |
| Restaurante piloto | Configurado y probado el 06/11/2026 | El propietario completó el menú, personal, roles, caja y datos del local. Las pruebas ocurrieron en producción; sus registros de prueba siguen en la base y deben conciliarse antes del turno real. |
| Flujo E2E del local | Flujo principal aprobado por el propietario | Se probaron apertura/cierre de caja, pedidos, cocina/barra, traslado de consumo, precuenta, impresión, cobros divididos, vuelto, anulaciones, dashboard y CSV. La prueba física con impresora y turno real sigue pendiente. |
| Crear mesa duplicada | Mensaje corregido | El nombre es único en todo el restaurante, también entre zonas. La pantalla ahora detecta el duplicado y explica qué nombre debe cambiarse; la base conserva la restricción. |
| Pasar mesa a otro mesero | Corregido en código y Supabase | Selector de meseros activos del mismo restaurante; PIN cuando está configurado, motivo obligatorio y auditoría. La aceptación final entre dos cuentas reales queda pendiente de repetición en el local. |
| Recuperación del superadmin | Completada por el propietario | Confirmó recepción del enlace, nueva contraseña e ingreso. |
| Recuperación del admin de restaurante | Completada por el propietario | Confirmó recepción del enlace y cambio de contraseña. El correo alternativo es una integración distinta. |
| Contacto comercial | Envío y recepción confirmados | Función respondió HTTP 200 con `ok: true`; el propietario confirmó que la consulta llegó al buzón. Reintentos, errores y carga tienen pruebas aisladas. |
| Bandejas y alertas | Desplegadas en producción | Consultas comerciales con seguimiento, conversaciones de soporte y cola de avisos. La recepción del formulario comercial fue confirmada por el propietario; falta una conversación real de soporte entre ambas cuentas. |
| Borrado de soporte | Corregido en producción | Se revocó el privilegio SQL directo de `DELETE` para `anon` y `authenticated`; comprobación de privilegios devuelve `false`. |
| Respaldo | Copia limpia posterior al reset restaurada en PostgreSQL 17.6 aislado; cifrado DPAPI y descifrado/hash verificados | Las copias locales anteriores aún conservan datos de prueba y requieren purga; también falta ubicación cifrada portable, frecuencia/retención y cobertura de Storage/configuración. |
| Repositorio | Revisión de exposición completada | 39 commits alcanzables, 472 blobs, 471 de texto; sin coincidencias de los patrones de secretos buscados. No es una garantía contra cualquier secreto o información sensible. |
| Identidad | Opción A aprobada y publicada | Logo, favicon y cabeceras aplicados; kit vectorial en `docs/marca/kit-mesora/` y copia local verificada en `backups/`. |

## Hitos técnicos y comerciales comprobados

- Consulta comercial aceptada por Resend y recibida en el buzón, según confirmó
  el propietario.
- Formulario con carga anunciada, protección contra doble envío, conservación
  de datos y reintento. El respaldo manual requiere pulsar su enlace.
- Función de contacto rechaza JSON `null`/arrays, limita la espera del proveedor,
  maneja fallos de red y usa idempotencia para consultas idénticas del mismo día UTC.
- QA de contacto integrada en CI, con Resend y Supabase simulados y sin correo real.
- Bandeja comercial para el superadmin, tipos de ticket de soporte y reintento
  programado de avisos de correo. La respuesta de la landing distingue aviso
  enviado de aviso pendiente.
- Conversaciones de soporte con respuestas del admin y del superadmin, además
  de notificaciones por correo en cola. El historial permanece en Mesora.
- Guía práctica del primer turno y kit de la marca aprobada preparados.
- Retirado el asistente local de carga de la clave de Resend, que ya cumplió su
  función. La clave permanece en Supabase, fuera de Git.

## Verificación de esta entrega

| Prueba local | Resultado |
| --- | --- |
| Reglas y flujo del backend local | 510 comprobaciones aprobadas. |
| Instalación y circuito SQL aislado | Aprobados: permisos, recuperación, pedidos, reportes, caja, 1205 pedidos y restauración. |
| Acceso y recuperación con Auth simulado | Aprobados: usuario inactivo, cambio temporal, refresco, salida y respuesta genérica. |
| Precuenta | 24 escenarios aprobados, PDF/impresión en móvil y escritorio. |
| Configuración | Validación, payload permitido, reintento y persistencia aprobados. |
| Responsive | 668 comprobaciones aprobadas; cuatro viewports del sistema y 16 anchos de landing. |
| Contacto en navegador | Aprobado a 360 y 1280 px: doble evento, fallo, reintento, enlace manual y éxito. |
| Contacto en Deno | Una prueba con cuatro grupos aprobados; sin permisos de red. |
| TypeScript y build | Aprobados. |
| Traslado de mesa en SQL aislado | Aprobado con PIN incorrecto/correcto, aislamiento de restaurante y auditoría con actor, fecha y motivo. |
| Dependencias | `npm audit`: cero vulnerabilidades reportadas al revisar. |
| Propuesta de marca | SVG renderizados y presentación sin desborde a 360 px. |

Los resultados usan entornos locales, datos simulados y SQL aislado. La consulta
de inventario a producción fue de solo lectura. La prueba real de correo
aceptada por Resend y su recepción las confirmó el propietario; no se repiten
correos reales durante la regresión. El resultado de CI y la promoción a
producción se consultan en GitHub Actions y Vercel.

## Pendientes que necesitan al propietario o al local

1. Repetir el traspaso de Carlos a María con PIN incorrecto y correcto; confirmar
   que el destinatario ve la mesa y que la auditoría registra responsable,
   usuario, fecha, mesa y motivo.
2. Imprimir y reimprimir una comanda de cocina/barra con la impresora del local.
3. Probar acceso entre roles, aislamiento entre restaurantes, usuario inactivo y
   bloqueo de apertura de un segundo turno mientras ya hay uno abierto. Las
   pruebas SQL aisladas cubren parte de esos controles, no la aceptación de UI.
4. Probar pérdida temporal de internet y recuperación sin duplicar pedidos/cobros.
5. Purgar las copias locales previas al reset que todavía guardan datos de
   prueba; elegir destino externo cifrado y responsable; completar frecuencia,
   retención y recuperación de servicios complementarios.
6. Ejecutar la [guía del primer turno](./GUIA_PRIMER_TURNO.md) con impresora,
   dispositivos y personal reales; registrar conciliación e incidencias.
7. Asignar encargado y contacto de soporte durante el primer turno.
8. Completar y publicar condiciones del servicio y aviso de privacidad cuando
   el titular confirme identidad legal, RUC/documento, domicilio, canales
   oficiales, planes, precios y conservación. Los borradores requieren revisión
   legal y no están publicados.
9. Confirmar que nombre y logo pueden usarse comercialmente; la revisión
   preliminar no sustituye una búsqueda registral en Indecopi.
10. Revisar en Vercel **Project → Settings → Deployment Checks** por qué el
    control de promoción devuelve `Checks for Deployment have failed`. El build
    de `main` quedó `READY` y `mesora-sistema.vercel.app` se reasignó manualmente
    al último despliegue; hasta resolver el control no se confirmó la promoción
    automática de ese alias en futuras publicaciones.

## Mejoras posteriores y decisiones comerciales

- Sincronizar la plantilla de recuperación alojada en Supabase con el archivo
  versionado `supabase/templates/recuperar-contrasena.html`. Las piezas de correo
  comercial, precuenta y recibos ya incorporan la opción A en el código.
- Actualizar el video con la versión aceptada y sus capturas, tal como pidió
  el propietario. Mantener el video de la demo fuera de la landing final.
- Resolver las coincidencias del nombre descritas en la
  [revisión preliminar](./marca/REVISION_PRELIMINAR_NOMBRE.md) y consultar los
  antecedentes oficiales antes de ampliar la promoción comercial.
- Elegir la licencia del repositorio; no se añadió una licencia sin decisión
  del titular. Que el código sea visible no define los permisos de reutilización.
- Aprobar un plazo de retención y publicarlo en una política de privacidad antes
  de automatizar eliminaciones. La propuesta interna no es todavía una política.
- Con dominio propio, verificar remitente y configurar correo corporativo.
  El remitente inicial de Resend no habilita correos arbitrarios a clientes.
- Antes de campañas: medir si las cuotas de contacto implantadas (por correo,
  por IP confiable y global) se ajustan al tráfico real. El cupo global puede
  agotarse con abuso y el canal manual debe seguir disponible.
- Completar las pruebas HTTP con tokens Auth reales y confirmar la entrega
  efectiva de los nuevos avisos de incidencias y soporte. La matriz SQL y las
  notificaciones dentro del panel no sustituyen esas comprobaciones.
- En los avisos de Supabase queda habilitar la protección de contraseñas filtradas
  y revisar las funciones `SECURITY DEFINER` de forma individual. El linter lista
  35 funciones ejecutables por usuarios autenticados; no se revocaron en bloque,
  porque varias sostienen operaciones legítimas y cada una debe validar rol,
  restaurante y alcance antes de decidir cambios.
- Confirmar en Indecopi la denominación y el logo en las clases de servicio
  aplicables; la revisión preliminar no es una búsqueda registral certificada.

## Criterio de cierre

El MVP técnico debe compilar y aprobar las suites exigidas por CI; la versión
de `main` debe llegar a Vercel y superar la comprobación pública. La aceptación
operativa requiere completar los puntos del local anteriores y aprobarlos con
el encargado. No se asigna un porcentaje que mezcle esas dos condiciones.

Documentos: [operación](./OPERACION_PILOTO.md), [respaldo](./RESPALDOS.md),
[contacto](./CONTACTO_COMERCIAL.md), [alcance técnico](./PILOTO.md).
