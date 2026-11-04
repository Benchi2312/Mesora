# Estado del MVP de Mesora

Revisión: 04/11/2026. Versión técnica **0.1.0**.
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
| Publicación | GitHub público, `main` conectado a Vercel | Repo `Benchi2312/Mesora`; revisar CI y despliegue para cada publicación. |
| Instalación inicial | Ya existe | Consulta agregada de solo lectura: un restaurante, un superadmin, un admin y un empleado. No se publican nombres ni correos personales. Esto no certifica configuración ni capacitación. |
| Recuperación del superadmin | Completada por el propietario | Confirmó recepción del enlace, nueva contraseña e ingreso. |
| Recuperación del admin de restaurante | Completada por el propietario | Confirmó recepción del enlace y cambio de contraseña. El correo alternativo es una integración distinta. |
| Contacto comercial | Envío y recepción confirmados | Función respondió HTTP 200 con `ok: true`; el propietario confirmó que la consulta llegó al buzón. Reintentos, errores y carga tienen pruebas aisladas. |
| Bandejas y alertas | Implementadas en esta entrega; validación local aprobada | Consultas comerciales privadas con seguimiento, tickets por tipo y cola de correo para avisos. Verificar el circuito desplegado y recepción real después de publicar. |
| Respaldo | Exportación y restauración local documentadas | Falta copia cifrada fuera del equipo, frecuencia, retención y cobertura de Storage/configuración. |
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
| Dependencias | `npm audit`: cero vulnerabilidades reportadas al revisar. |
| Propuesta de marca | SVG renderizados y presentación sin desborde a 360 px. |

Los resultados usan entornos locales, datos simulados y SQL aislado. La consulta
de inventario a producción fue de solo lectura. La prueba real de correo
aceptada por Resend y su recepción las confirmó el propietario; no se repiten
correos reales durante la regresión. El resultado de CI y la promoción a
producción se consultan en GitHub Actions y Vercel.

## Pendientes que necesitan al propietario o al local

1. Completar la configuración del restaurante existente: menú, precios, roles,
   suscripción, PIN y datos del local. Inventariar los datos antes de decidir
   cualquier limpieza; no volver a crear la instalación por duplicado.
2. Elegir destino externo cifrado del respaldo y responsable; completar su
   frecuencia, retención y recuperación de servicios complementarios.
3. Ejecutar la [guía del primer turno](./GUIA_PRIMER_TURNO.md) con impresora,
   dispositivos y personal reales; registrar conciliación e incidencias.
4. Asignar encargado y contacto de soporte durante el primer turno.

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
- Con dominio propio, verificar remitente y configurar correo corporativo.
  El remitente inicial de Resend no habilita correos arbitrarios a clientes.
- Antes de campañas: medir si las cuotas de contacto implantadas (por correo,
  por IP confiable y global) se ajustan al tráfico real. El cupo global puede
  agotarse con abuso y el canal manual debe seguir disponible.
- Completar las pruebas HTTP con tokens Auth reales y confirmar la entrega
  efectiva de los nuevos avisos de incidencias y soporte. La matriz SQL y las
  notificaciones dentro del panel no sustituyen esas comprobaciones.

## Criterio de cierre

El MVP técnico debe compilar y aprobar las suites exigidas por CI; la versión
de `main` debe llegar a Vercel y superar la comprobación pública. La aceptación
operativa requiere además los cuatro pendientes del local anteriores. No se
asigna un porcentaje que mezcle esas dos condiciones.

Documentos: [operación](./OPERACION_PILOTO.md), [respaldo](./RESPALDOS.md),
[contacto](./CONTACTO_COMERCIAL.md), [alcance técnico](./PILOTO.md).
