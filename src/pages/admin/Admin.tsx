import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import { useDemoStore } from '../../demo/demoStore'
import DashboardTab from './DashboardTab'
import MesasZonasTab from './MesasZonasTab'
import MenuTab from './MenuTab'
import PersonalTab from './PersonalTab'
import ConfiguracionTab from './ConfiguracionTab'
import SoporteTab from './SoporteTab'
import CajaTab from './CajaTab'
import CobrosTab from './CobrosTab'
import VentasTab from './VentasTab'
import AvisoSuscripcion from './AvisoSuscripcion'

type SeccionTab = 'dashboard' | 'ventas' | 'caja' | 'cobros' | 'mesas' | 'menu' | 'personal' | 'configuracion' | 'soporte'

const SECCIONES: { id: SeccionTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'caja', label: 'Caja' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'mesas', label: 'Mesas y zonas' },
  { id: 'menu', label: 'Menú' },
  { id: 'personal', label: 'Personal' },
  { id: 'configuracion', label: 'Datos del local' },
  { id: 'soporte', label: 'Soporte' },
]

export default function Admin() {
  const [seccion, setSeccion] = useState<SeccionTab>('dashboard')
  const solicitud = useDemoStore((s) => s.solicitud)

  // «Hazlo por mí» puede pedir una pestaña concreta (p. ej. Mesas y zonas o
  // Menú) para abrir ahí el formulario con datos sugeridos.
  useEffect(() => {
    const pedida = solicitud?.tab
    if (pedida && pedida !== seccion && SECCIONES.some((s) => s.id === pedida)) {
      setSeccion(pedida)
    }
  }, [solicitud, seccion])

  return (
    <div>
      <PageHeader
        titulo="Panel de administración"
        descripcion="Gestiona las ventas, las mesas, el menú y el equipo de tu restaurante."
      />

      <AvisoSuscripcion />

      <nav className="no-print mb-8 flex flex-wrap gap-2" aria-label="Secciones de administración">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            data-guia={`admin-tab-${s.id}`}
            aria-current={seccion === s.id ? 'page' : undefined}
            onClick={() => setSeccion(s.id)}
            className={`min-h-11 touch-manipulation rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              seccion === s.id
                ? 'border-brand-500 bg-brand-500/15 text-brand-400 shadow-sm shadow-brand-500/10'
                : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500 hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {seccion === 'dashboard' && <DashboardTab />}
      {seccion === 'ventas' && <VentasTab />}
      {seccion === 'caja' && <CajaTab />}
      {seccion === 'cobros' && <CobrosTab />}
      {seccion === 'mesas' && <MesasZonasTab />}
      {seccion === 'menu' && <MenuTab />}
      {seccion === 'personal' && <PersonalTab />}
      {seccion === 'configuracion' && <ConfiguracionTab />}
      {seccion === 'soporte' && <SoporteTab />}
    </div>
  )
}
