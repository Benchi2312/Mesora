import { useState } from 'react'
import PageHeader from '../../components/PageHeader'
import CajaTab from '../admin/CajaTab'
import CobrosTab from '../admin/CobrosTab'

/**
 * Vista del rol `cajero`: la caja (apertura de gaveta, arqueo y cierre de turno) y
 * las boletas del día para poder anular un cobro. Es el mismo contenido que las
 * pestañas "Caja" y "Cobros" del panel del Admin, sin el resto: el cajero no ve
 * menú, mesas, personal ni reportes.
 *
 * Por qué el cajero puede anular cobros y el mesero no: el cajero es quien tiene
 * la gaveta y quien ve al cliente, así que es el que devuelve el dinero (y puede
 * pedir el PIN de autorización). El mesero no cobra, entonces no anula.
 */
export default function Cajero() {
  const [vista, setVista] = useState<'caja' | 'cobros'>('caja')

  return (
    <div>
      <PageHeader
        titulo="Caja"
        descripcion="Abre la gaveta al iniciar el turno y ciérrala con el arqueo al terminar."
      />

      <nav className="no-print mb-8 flex flex-wrap gap-2" aria-label="Secciones de caja">
        {(
          [
            { id: 'caja', label: 'Turno' },
            { id: 'cobros', label: 'Boletas de hoy' },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={vista === s.id ? 'page' : undefined}
            onClick={() => setVista(s.id)}
            className={`min-h-11 touch-manipulation rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              vista === s.id
                ? 'border-brand-500 bg-brand-500/15 text-brand-400 shadow-sm shadow-brand-500/10'
                : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500 hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {vista === 'caja' ? <CajaTab /> : <CobrosTab />}
    </div>
  )
}
