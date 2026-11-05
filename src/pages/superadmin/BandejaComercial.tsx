import { useCallback, useEffect, useMemo, useState } from 'react'
import { getApi } from '../../lib/api'
import type { BandejaComercial as BandejaData, ConsultaComercial } from '../../types/database'
import { fmtFecha } from '../../lib/format'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'

const ESTADOS: { value: ConsultaComercial['estado']; label: string }[] = [
  { value: 'nuevo', label: 'Nueva' },
  { value: 'en_seguimiento', label: 'En seguimiento' },
  { value: 'cerrado', label: 'Cerrada' },
]

export default function BandejaComercial() {
  const [datos, setDatos] = useState<BandejaData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [guardando, setGuardando] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [responsable, setResponsable] = useState('')
  const [nota, setNota] = useState('')
  const [fecha, setFecha] = useState('')

  const cargar = useCallback(async () => {
    const res = await getApi().getBandejaComercial()
    if (res.error) setError(res.error)
    else { setDatos(res.data); setError(null) }
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const consultas = useMemo(() => (datos?.consultas ?? []).filter((c) => {
    if (filtro !== 'todas' && c.estado !== filtro) return false
    const texto = `${c.nombre} ${c.restaurante} ${c.email} ${c.mensaje}`.toLocaleLowerCase()
    return texto.includes(busqueda.trim().toLocaleLowerCase())
  }), [datos, filtro, busqueda])

  async function cambiarEstado(consulta: ConsultaComercial, estado: ConsultaComercial['estado']) {
    setGuardando(consulta.id)
    setError(null)
    const res = await getApi().actualizarConsultaComercial(consulta.id, estado)
    if (res.error) setError(res.error)
    else await cargar()
    setGuardando(null)
  }

  function abrirSeguimiento(c: ConsultaComercial) {
    setEditando(c.id)
    setResponsable(c.responsable ?? '')
    setNota(c.nota_interna ?? '')
    setFecha(c.proximo_contacto ?? '')
  }

  async function guardarSeguimiento(id: string) {
    setGuardando(id)
    setError(null)
    const res = await getApi().actualizarSeguimientoComercial(id, responsable, nota, fecha || null)
    setGuardando(null)
    if (res.error) { setError(res.error); return }
    setEditando(null)
    await cargar()
  }

  if (cargando) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-zinc-100">Consultas comerciales</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Solicitudes de la landing. Se guardan aquí y se avisan a mesoratech@gmail.com; si el correo falla, se reintenta automáticamente.
        </p>
      </div>
      {error && <div className="aviso mb-5 border-danger-500/40 bg-danger-500/10 text-danger-500" role="alert">{error}</div>}
      {datos && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ['Hoy', datos.resumen.hoy],
            ['Últimos 30 días', datos.resumen.ultimos_30_dias],
            ['Nuevas', datos.resumen.nuevas],
            ['Correo pendiente', datos.resumen.correo_pendiente],
            ['Correo fallido', datos.resumen.correo_fallido],
            ['Contactos atrasados', datos.resumen.contactos_vencidos],
          ].map(([label, total]) => (
            <div className="card px-4 py-3" key={label}>
              <p className="text-xs text-zinc-400">{label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">{total}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mb-5 flex flex-wrap gap-3">
        <input type="search" className="input min-h-11 w-full sm:max-w-sm" aria-label="Buscar consultas comerciales"
          placeholder="Buscar restaurante, nombre o correo…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select className="input min-h-11 w-auto" aria-label="Filtrar consultas comerciales" value={filtro}
          onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <span className="self-center text-xs text-zinc-500" aria-live="polite">{consultas.length} de {datos?.consultas.length ?? 0}</span>
      </div>
      {!consultas.length ? (
        <EstadoVacio titulo={datos?.consultas.length ? 'Sin coincidencias' : 'Aún no hay consultas'}
          descripcion={datos?.consultas.length ? 'Ajusta la búsqueda o el estado.' : 'Las solicitudes que lleguen desde la landing aparecerán aquí.'} />
      ) : (
        <ul className="space-y-3">
          {consultas.map((c) => (
            <li className="card p-4 sm:p-5" key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-100">{c.restaurante}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{c.nombre} · <a className="text-brand-400 hover:underline" href={`mailto:${c.email}`}>{c.email}</a></p>
                </div>
                <span className="text-xs text-zinc-500">{fmtFecha(c.created_at)}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{c.mensaje || 'Solicitó información sobre Mesora.'}</p>
              {(c.responsable || c.proximo_contacto) && <p className="mt-2 text-xs text-zinc-400">
                {c.responsable ? `Responsable: ${c.responsable}` : 'Sin responsable'}
                {c.proximo_contacto ? ` · Próximo contacto: ${c.proximo_contacto}` : ''}
              </p>}
              {c.nota_interna && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-800 p-3 text-xs text-zinc-300">Nota interna: {c.nota_interna}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-surface-800 pt-3">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  Seguimiento
                  <select className="input min-h-10 w-auto text-sm" value={c.estado} disabled={guardando === c.id}
                    onChange={(e) => void cambiarEstado(c, e.target.value as ConsultaComercial['estado'])}>
                    {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </label>
                <span className="text-xs text-zinc-500">Correo: {c.correo_estado === 'enviado' ? 'enviado' : c.correo_estado === 'fallido' ? 'falló tras los reintentos' : 'pendiente de entrega'}</span>
                <button type="button" className="btn btn-outline min-h-10 px-3 text-xs" onClick={() => editando === c.id ? setEditando(null) : abrirSeguimiento(c)}>
                  {editando === c.id ? 'Cancelar edición' : 'Planificar contacto'}
                </button>
              </div>
              {editando === c.id && <form className="mt-4 grid gap-3 border-t border-surface-800 pt-4 sm:grid-cols-2"
                onSubmit={(e) => { e.preventDefault(); void guardarSeguimiento(c.id) }}>
                <label className="text-xs text-zinc-300">Responsable
                  <input className="input mt-1" maxLength={120} value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Persona encargada" />
                </label>
                <label className="text-xs text-zinc-300">Próximo contacto
                  <input className="input mt-1" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </label>
                <label className="text-xs text-zinc-300 sm:col-span-2">Nota interna
                  <textarea className="input mt-1 min-h-24" maxLength={2000} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué se acordó y cuál es el siguiente paso" />
                </label>
                <button className="btn btn-primary min-h-11 px-4 sm:col-span-2 sm:justify-self-start" type="submit" disabled={guardando === c.id}>
                  {guardando === c.id ? 'Guardando…' : 'Guardar seguimiento'}
                </button>
              </form>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-zinc-500">Esta bandeja solo muestra las 100 consultas más recientes. Los totales incluyen todo el historial.</p>
    </div>
  )
}
