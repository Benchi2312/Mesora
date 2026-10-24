import EstadoVacio from '../../components/EstadoVacio'

/**
 * Ruta preparada de un módulo del panel del super admin que todavía no existe:
 * el ítem del menú navega aquí en lugar de inventar una pantalla con datos
 * falsos. El icono es una herramienta (llave inglesa) para marcar "en obra".
 */
export default function Proximamente({ modulo }: { modulo: string }) {
  return (
    <EstadoVacio
      icono={
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3z" />
          <path d="M14.7 6.3 18 3l3 3-3.3 3.3" />
        </svg>
      }
      titulo={`Módulo «${modulo}» — próximamente`}
      descripcion="Esta sección del panel de la plataforma está en construcción y estará disponible en una próxima versión."
    />
  )
}
