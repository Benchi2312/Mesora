# Propuesta de conservación de datos de contacto y soporte

Estado: **borrador para decisión del propietario**. Los periodos siguientes son
una propuesta operativa; todavía no activan borrado ni reemplazan la revisión de
la política de privacidad con asesoría local.

## Periodos propuestos

| Datos | Propuesta inicial | Acción al vencer |
| --- | --- | --- |
| Consultas comerciales | 12 meses desde el último contacto | Eliminar o anonimizar los datos de contacto y el texto libre. |
| Tickets y mensajes de soporte | 24 meses desde el cierre | Eliminar o anonimizar el contenido personal; conservar solo métricas sin identificar cuando sean necesarias. |
| Cola de correo y payload de aviso | 90 días desde el envío o el fallo final | Eliminar el payload; conservar, si hace falta, fecha y estado técnico sin datos personales. |
| Incidentes técnicos | 180 días | Conservar códigos y métricas; excluir contraseñas, PIN, contenido de pedidos y datos de contacto. |
| Copias de respaldo | 30 días de rotación, tras crear y verificar una copia nueva | Eliminar la copia más antigua de forma segura. Mantener una copia cifrada separada de la computadora. |

## Condiciones antes de automatizar

1. Confirmar quién determina la finalidad de cada dato (Mesora o el restaurante),
   los proveedores que lo reciben y quién responde solicitudes de las personas.
2. Publicar un aviso de privacidad que indique finalidad, categorías de datos,
   destinatarios, criterio/plazo de conservación y un canal para ejercer derechos.
3. Revisar excepciones de conservación por reclamos, obligaciones contractuales
   o legales con asesoría local. Un bloqueo de eliminación debe tener motivo,
   alcance y fecha de revisión; no convierte el plazo en indefinido.
4. Definir cómo aplicar supresión, anonimización y bloqueo a registros en vivo,
   cola de correo, logs y copias de respaldo. Probar la restauración sin volver a
   reintroducir registros que debieron eliminarse.
5. La bandeja comercial actualmente une cada consulta a su fila de entrega de
   correo. Si se elimina esa fila, la consulta desaparece de la vista actual;
   antes de automatizar los 90 días, desacoplar el estado de entrega del payload.
6. Aprobar por escrito los periodos y la fecha de entrada en vigor. Hasta entonces
   no ejecutar purgas automáticas.

El Reglamento peruano vigente exige documentar procedimientos de conservación,
bloqueo y supresión que incluyan periodos de conservación. Esta tabla propone
plazos internos; no determina cuál es el plazo legal aplicable a cada registro,
ni sustituye la revisión del aviso de privacidad y de las obligaciones propias
de cada restaurante.

Referencias oficiales:

- [Reglamento de la Ley 29733, D.S. 016-2024-JUS](https://www.gob.pe/institucion/anpd/normas-legales/6554453-n-016-2024-jus)
- [Orientación oficial de Indecopi para buscar antecedentes de marca](https://www.gob.pe/328-instituto-nacional-de-defensa-de-la-competencia-y-de-la-proteccion-de-la-propiedad-intelectual-busqueda-de-antecedentes-de-una-marca)
