# Opciones de licencia para el repositorio Mesora

El repositorio es público y aún no declara licencia. La visibilidad permite
consultar y bifurcar desde GitHub, pero no equivale a conceder una licencia
general para reutilizar, modificar o distribuir el código. GitHub explica las
consecuencias en su [guía de licencias](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

## Opciones

| Opción | Qué permite | Encaje para Mesora |
| --- | --- | --- |
| Mantener sin licencia | Conserva el copyright; no ofrece permiso general de reutilización. | Adecuado si el código es público para mostrar el producto y el negocio sigue siendo propietario. Añadir una nota clara en el README. |
| MIT | Reutilización, modificación y distribución, incluso comercial, conservando avisos de copyright y licencia. | Simple y permisiva; facilita que terceros usen el código para otros productos. |
| Apache-2.0 | Permisiva como MIT e incluye concesión expresa de patentes y condiciones de avisos. | Mejor si se busca adopción y protección de patentes a nivel de licencia. |
| AGPL-3.0 | Copyleft fuerte; quien ofrece una versión modificada por red debe ofrecer el código fuente correspondiente a sus usuarios. | Puede desalentar forks cerrados como servicio, pero añade obligaciones de cumplimiento y revisión de dependencias. |
| Licencia comercial propia | Permisos definidos mediante contrato para clientes o socios. | Útil si se quiere entregar código o derechos de uso específicos; conviene prepararla con asesoría profesional. |

## Recomendación para decidir

Por el modelo SaaS de Mesora y la intención de usar GitHub como escaparate, la
opción más conservadora es mantener el repositorio sin licencia abierta por
ahora y explicarlo en el README. Si el objetivo pasa a ser recibir contribuciones
y permitir reutilización, comparar Apache-2.0 con AGPL-3.0 antes de añadir una
licencia. No añadir una licencia a los archivos de la marca o dependencias que
no sean propiedad de Mesora.

La decisión afecta los permisos que se conceden a cualquier persona y los
aportes futuros; por eso este documento solo presenta opciones. La ausencia de
una licencia no elimina la posibilidad de que GitHub permita ver o bifurcar el
repositorio bajo sus condiciones de servicio.
