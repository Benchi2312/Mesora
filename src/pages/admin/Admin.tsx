import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import PageHeader from '../../components/PageHeader'
import { useDemoStore } from '../../demo/demoStore'
import { useCurrentContext } from '../../lib/useCurrentContext'
import DashboardTab from './DashboardTab'
import MesasZonasTab from './MesasZonasTab'
import MenuTab from './MenuTab'
import PersonalTab from './PersonalTab'
import ConfiguracionTab from './ConfiguracionTab'
import ConfiguracionOperativaTab from './ConfiguracionOperativaTab'
import AgentesImpresionTab from './AgentesImpresionTab'
import SoporteTab from './SoporteTab'
import CajaTab from './CajaTab'
import CobrosTab from './CobrosTab'
import VentasTab from './VentasTab'
import AvisoSuscripcion from './AvisoSuscripcion'
import AuditoriaRestauranteTab from './AuditoriaRestauranteTab'
import './admin-layout.css'

type SeccionTab = 'dashboard' | 'ventas' | 'caja' | 'cobros' | 'mesas' | 'menu' | 'personal' | 'configuracion' | 'configuracion-operativa' | 'agentes-impresion' | 'auditoria' | 'soporte'

const SECCIONES: { id: SeccionTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'caja', label: 'Caja' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'mesas', label: 'Mesas y zonas' },
  { id: 'menu', label: 'Menú' },
  { id: 'personal', label: 'Personal' },
  { id: 'configuracion', label: 'Datos del local' },
  { id: 'configuracion-operativa', label: 'Configuración operativa' },
  { id: 'agentes-impresion', label: 'Impresión automática' },
  { id: 'auditoria', label: 'Auditoría' },
  { id: 'soporte', label: 'Soporte' },
]

const GRUPOS: { titulo: string; ids: SeccionTab[] }[] = [
  { titulo: 'Operación', ids: ['mesas', 'menu', 'personal', 'configuracion-operativa', 'agentes-impresion'] },
  { titulo: 'Control', ids: ['dashboard', 'ventas', 'caja', 'cobros', 'auditoria'] },
  { titulo: 'Local y ayuda', ids: ['configuracion', 'soporte'] },
]

function IconoSeccion({ id }: { id: SeccionTab }) {
  const comun = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const forma: Record<SeccionTab, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    ventas: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></>,
    caja: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M7 6V4h10v2" /><path d="M16 15h2" /></>,
    cobros: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
    mesas: <><path d="M4 20V8m16 12V8M4 12h16M7 8V5h10v3M8 12v4m8-4v4" /></>,
    menu: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r=".8" /><circle cx="4" cy="12" r=".8" /><circle cx="4" cy="18" r=".8" /></>,
    personal: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8" /></>,
    configuracion: <><path d="M3 10h18l-2-6H5zM5 10v10h14V10M9 20v-6h6v6" /></>,
    'configuracion-operativa': <><path d="M4 7h7M15 7h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
    'agentes-impresion': <><path d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v6H7zM17 11h.01" /></>,
    auditoria: <><path d="M8 4H5a2 2 0 0 0-2 2v14h18V6a2 2 0 0 0-2-2h-3" /><path d="M8 3h8v4H8zM7 12h10M7 16h7" /></>,
    soporte: <><path d="M4 5h16v12h-9l-5 4z" /><path d="M8 10h8M8 13h5" /></>,
  }

  return <svg className="admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true" {...comun}>{forma[id]}</svg>
}

function Navegacion({ seccion, seleccionar }: { seccion: SeccionTab; seleccionar: (id: SeccionTab) => void }) {
  return (
    <nav className="admin-nav" aria-label="Secciones de administración">
      {GRUPOS.map((grupo) => (
        <div className="admin-nav-group" key={grupo.titulo}>
          <h2 className="admin-nav-group-title">{grupo.titulo}</h2>
          <div className="admin-nav-group-items">
            {grupo.ids.map((id) => {
              const s = SECCIONES.find((item) => item.id === id)!
              return (
                <button
                  key={s.id}
                  type="button"
                  data-guia={`admin-tab-${s.id}`}
                  aria-current={seccion === s.id ? 'page' : undefined}
                  onClick={() => seleccionar(s.id)}
                  className={`admin-nav-item${seccion === s.id ? ' is-active' : ''}`}
                >
                  <span className="admin-nav-item-icon"><IconoSeccion id={s.id} /></span>
                  <span>{s.label}</span>
                  {seccion === s.id && <span className="admin-nav-item-marker" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export default function Admin() {
  const [seccion, setSeccion] = useState<SeccionTab>('dashboard')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const solicitud = useDemoStore((s) => s.solicitud)
  const { restaurante } = useCurrentContext()
  const botonMenuRef = useRef<HTMLButtonElement>(null)
  const botonCerrarRef = useRef<HTMLButtonElement>(null)
  const dialogoRef = useRef<HTMLElement>(null)
  const nombreRestaurante = restaurante?.nombre ?? 'Restaurante activo'
  const encabezadoPorSeccion: Partial<Record<SeccionTab, { titulo: string; descripcion: string }>> = {
    dashboard: { titulo: 'Resumen de ventas', descripcion: 'Revisa los resultados reales del periodo y cómo se distribuyen las ventas.' },
    caja: { titulo: 'Caja del turno', descripcion: 'Consulta el estado del turno, cobra mesas autorizadas y revisa el arqueo.' },
    cobros: { titulo: 'Cobros y recibos internos', descripcion: 'Consulta lo cobrado y anulado; las cuentas pendientes se atienden desde Caja.' },
  }
  const encabezado = encabezadoPorSeccion[seccion] ?? {
    titulo: 'Panel de administración',
    descripcion: 'Gestiona las ventas, las mesas, el menú y el equipo de tu restaurante.',
  }

  // «Hazlo por mí» puede pedir una pestaña concreta (p. ej. Mesas y zonas o
  // Menú) para abrir ahí el formulario con datos sugeridos.
  useEffect(() => {
    const pedida = solicitud?.tab
    if (pedida && pedida !== seccion && SECCIONES.some((s) => s.id === pedida)) {
      setSeccion(pedida)
    }
  }, [solicitud, seccion])

  useEffect(() => {
    if (!menuAbierto) return
    const anterior = document.activeElement as HTMLElement | null
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    botonCerrarRef.current?.focus()

    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        setMenuAbierto(false)
        return
      }
      if (evento.key !== 'Tab' || !dialogoRef.current) return
      const elementos = Array.from(dialogoRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ))
      if (!elementos.length) return
      const primero = elementos[0]
      const ultimo = elementos[elementos.length - 1]
      if (evento.shiftKey && (document.activeElement === primero || !dialogoRef.current.contains(document.activeElement))) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && (document.activeElement === ultimo || !dialogoRef.current.contains(document.activeElement))) {
        evento.preventDefault()
        primero.focus()
      }
    }

    document.addEventListener('keydown', alPulsarTecla)
    return () => {
      document.removeEventListener('keydown', alPulsarTecla)
      document.body.style.overflow = overflowAnterior
      if (anterior?.isConnected) anterior.focus()
      else botonMenuRef.current?.focus()
    }
  }, [menuAbierto])

  const seleccionarSeccion = (id: SeccionTab) => {
    setSeccion(id)
    setMenuAbierto(false)
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Administración del restaurante">
        <div className="admin-sidebar-brand">
          <img src="/marca/isotipo.svg" alt="" aria-hidden="true" />
          <div>
            <strong>Mesora</strong>
            <span>Administración</span>
          </div>
        </div>
        <div className="admin-restaurant">
          <span className="admin-restaurant-label">RESTAURANTE ACTIVO</span>
          <strong title={nombreRestaurante}>{nombreRestaurante}</strong>
        </div>
        <Navegacion seccion={seccion} seleccionar={seleccionarSeccion} />
        <div className="admin-sidebar-footnote">
          <span className="admin-sidebar-footnote-dot" aria-hidden="true" />
          Panel del restaurante
        </div>
      </aside>

      <div className="admin-content">
        <div className="admin-mobile-bar">
          <div className="admin-mobile-identity">
            <span>Administración</span>
            <strong title={nombreRestaurante}>{nombreRestaurante}</strong>
          </div>
          <button
            ref={botonMenuRef}
            type="button"
            className="admin-menu-trigger"
            aria-label="Abrir menú de administración"
            aria-expanded={menuAbierto}
            aria-controls={menuAbierto ? 'admin-navigation-drawer' : undefined}
            onClick={() => setMenuAbierto(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <span>Menú</span>
          </button>
        </div>

        {menuAbierto && (
          <div className="admin-drawer-layer">
            <button className="admin-drawer-backdrop" type="button" aria-label="Cerrar menú de administración" onClick={() => setMenuAbierto(false)} />
            <aside
              ref={dialogoRef}
              id="admin-navigation-drawer"
              className="admin-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navegación de administración"
            >
              <div className="admin-drawer-heading">
                <div className="admin-sidebar-brand">
                  <img src="/marca/isotipo.svg" alt="" aria-hidden="true" />
                  <div>
                    <strong>Mesora</strong>
                    <span>{nombreRestaurante}</span>
                  </div>
                </div>
                <button ref={botonCerrarRef} type="button" className="admin-drawer-close" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <Navegacion seccion={seccion} seleccionar={seleccionarSeccion} />
            </aside>
          </div>
        )}

        <PageHeader titulo={encabezado.titulo} descripcion={encabezado.descripcion} />

        <AvisoSuscripcion />

        <div data-admin-active-section={seccion}>
          {seccion === 'dashboard' && <DashboardTab />}
          {seccion === 'ventas' && <VentasTab />}
          {seccion === 'caja' && <CajaTab adminExperience />}
          {seccion === 'cobros' && <CobrosTab onVerCaja={() => seleccionarSeccion('caja')} />}
          {seccion === 'mesas' && <MesasZonasTab />}
          {seccion === 'menu' && <MenuTab />}
          {seccion === 'personal' && <PersonalTab />}
          {seccion === 'configuracion' && <ConfiguracionTab />}
          {seccion === 'configuracion-operativa' && <ConfiguracionOperativaTab />}
          {seccion === 'agentes-impresion' && <AgentesImpresionTab />}
          {seccion === 'auditoria' && <AuditoriaRestauranteTab />}
          {seccion === 'soporte' && <SoporteTab />}
        </div>
      </div>
    </div>
  )
}
