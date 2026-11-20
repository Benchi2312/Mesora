import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import { Modal } from '../../components/ui'
import PoliticaCobro from './PoliticaCobro'
import { getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import {
  type CambiosConfiguracionOperativa,
  type ConfiguracionOperativaEditor,
  type DestinoOperativoEditor,
  type EstacionOperativaEditor,
} from '../../domain/restaurant/operacion'
import type { EstacionComanda, TipoDestinoEstacion } from '../../types/database'

type ModoRecepcion = 'pantalla' | 'impresora' | 'ambas'

const ETIQUETA_ESTACION: Record<EstacionComanda, string> = {
  cocina: 'Cocina',
  bar: 'Barra',
  otros: 'Otros',
}

function copiaConfig(config: ConfiguracionOperativaEditor): CambiosConfiguracionOperativa {
  return {
    modalidad_cobro: config.modalidad_cobro,
    estaciones: config.estaciones.map((estacion) => ({
      ...estacion,
      destinos: estacion.destinos.map((destino) => ({
        ...destino,
        configuracion: { ...destino.configuracion },
      })),
    })),
    categorias: config.categorias.map((categoria) => ({ ...categoria })),
  }
}

function nombreDestino(tipo: TipoDestinoEstacion, codigo: EstacionComanda, ordinal: number) {
  const base = tipo === 'kds' ? `KDS ${ETIQUETA_ESTACION[codigo]}` : `Impresora ${ETIQUETA_ESTACION[codigo]}`
  return ordinal > 1 ? `${base} ${ordinal}` : base
}

function destinoNuevo(tipo: TipoDestinoEstacion, estacion: EstacionOperativaEditor): DestinoOperativoEditor {
  const ordinal = estacion.destinos.filter((destino) => destino.tipo === tipo).length + 1
  return {
    id: null,
    tipo,
    grupo: 'principal',
    nombre: nombreDestino(tipo, estacion.codigo, ordinal),
    papel_mm: tipo === 'impresora' ? 80 : null,
    configuracion: tipo === 'impresora' ? { copias: 1 } : {},
    activo: true,
  }
}

function destinoPrincipalActivo(estacion: EstacionOperativaEditor, tipo: TipoDestinoEstacion): boolean {
  return estacion.activo && estacion.destinos.some((destino) =>
    destino.tipo === tipo && destino.grupo === 'principal' && destino.activo,
  )
}

function modoRecepcion(estacion: EstacionOperativaEditor): ModoRecepcion | null {
  const kds = destinoPrincipalActivo(estacion, 'kds')
  const impresora = destinoPrincipalActivo(estacion, 'impresora')
  if (kds && impresora) return 'ambas'
  if (kds) return 'pantalla'
  if (impresora) return 'impresora'
  return null
}

function resumenRecepcion(estacion: EstacionOperativaEditor): string {
  const area = ETIQUETA_ESTACION[estacion.codigo]
  switch (modoRecepcion(estacion)) {
    case 'pantalla': return `${area} recibirá los pedidos solo en pantalla.`
    case 'impresora': return `${area} recibirá los pedidos solo por impresora.`
    case 'ambas': return `${area} recibirá los pedidos en pantalla y por impresora.`
    default: return `${area} todavía no tiene una forma de recibir pedidos seleccionada.`
  }
}

export default function ConfiguracionOperativaTab() {
  const { restaurante, usuario } = useCurrentContext()
  const restauranteId = restaurante?.id
  const esAdminRestaurante = usuario?.rol === 'admin_restaurante' && usuario.restaurante_id === restauranteId
  const [config, setConfig] = useState<ConfiguracionOperativaEditor | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirmarGuardar, setConfirmarGuardar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!restauranteId || !esAdminRestaurante) {
      setCargando(false)
      setConfig(null)
      return
    }
    setCargando(true)
    setError(null)
    const resultado = await getApi().getConfiguracionOperativa(restauranteId)
    if (resultado.error || !resultado.data) {
      setConfig(null)
      setError(resultado.error ?? 'No se pudo cargar la configuración. Actualiza la página e inténtalo de nuevo.')
    } else {
      setConfig(resultado.data)
    }
    setCargando(false)
  }, [restauranteId, esAdminRestaurante])

  useEffect(() => { void cargar() }, [cargar])

  const editando = Boolean(config && !config.solo_lectura)
  function cambiarEstacion(codigo: EstacionComanda, actualizar: (estacion: EstacionOperativaEditor) => EstacionOperativaEditor) {
    setAviso(null)
    setConfig((actual) => actual ? {
      ...actual,
      estaciones: actual.estaciones.map((estacion) => estacion.codigo === codigo ? actualizar(estacion) : estacion),
    } : actual)
  }

  function cambiarModoRecepcion(codigo: EstacionComanda, modo: ModoRecepcion) {
    cambiarEstacion(codigo, (estacion) => {
      const activosPorTipo: Record<TipoDestinoEstacion, boolean> = {
        kds: modo === 'pantalla' || modo === 'ambas',
        impresora: modo === 'impresora' || modo === 'ambas',
      }
      let destinos = [...estacion.destinos]
      for (const tipo of ['kds', 'impresora'] as const) {
        const existe = destinos.some((destino) => destino.tipo === tipo && destino.grupo === 'principal')
        if (existe) {
          destinos = destinos.map((destino) => destino.tipo === tipo && destino.grupo === 'principal'
            ? { ...destino, activo: activosPorTipo[tipo] }
            : destino)
        } else if (activosPorTipo[tipo]) {
          destinos = [...destinos, destinoNuevo(tipo, estacion)]
        }
      }
      return { ...estacion, activo: true, destinos }
    })
  }

  async function guardar() {
    if (!restauranteId || !config || guardando || !editando) return
    setGuardando(true)
    setError(null)
    try {
      const resultado = await getApi().guardarConfiguracionOperativa(restauranteId, copiaConfig(config))
      if (resultado.error || !resultado.data) {
        setError(resultado.error ?? 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.')
        return
      }
      setConfirmarGuardar(false)
      setConfig(resultado.data)
      setAviso('Configuración guardada. Se aplicará a los pedidos nuevos; los anteriores conservan la configuración que tenían.')
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'Ocurrió un error al guardar. La configuración no cambió; inténtalo otra vez.')
    } finally {
      setGuardando(false)
    }
  }

  if (!esAdminRestaurante) {
    return (
      <section className="card p-5 sm:p-7" role="alert">
        <h2 className="text-lg font-extrabold text-zinc-100">Acceso restringido</h2>
        <p className="mt-2 text-sm text-zinc-400">Solo el administrador de este restaurante puede consultar y editar la configuración operativa.</p>
      </section>
    )
  }

  if (cargando) return <div className="card p-6 text-sm text-zinc-400" role="status">Cargando configuración operativa…</div>
  if (!config) {
    return (
      <section className="card p-5 sm:p-7">
        <PageHeader titulo="Configuración operativa" descripcion="Define cómo trabaja tu restaurante. Las estaciones aplican a comandas nuevas; los permisos de cobro, a cobros futuros." />
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300" role="alert">{error}</p>
        <button type="button" onClick={() => void cargar()} className="btn btn-outline mt-4 min-h-11 rounded-xl px-4 py-2.5">Reintentar carga</button>
      </section>
    )
  }

  const estacionesPrincipales = (['cocina', 'bar'] as const).map((codigo) =>
    config.estaciones.find((estacion) => estacion.codigo === codigo)!,
  )
  const opcionesRecepcion: { id: ModoRecepcion; titulo: string; descripcion: string }[] = [
    { id: 'pantalla', titulo: 'Solo pantalla', descripcion: 'Los pedidos aparecerán en la pantalla de trabajo.' },
    { id: 'impresora', titulo: 'Solo impresora', descripcion: 'Los pedidos se enviarán a la impresora de comandas.' },
    { id: 'ambas', titulo: 'Pantalla e impresora', descripcion: 'Los pedidos aparecerán en pantalla y también se imprimirán.' },
  ]
  const resumen = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {estacionesPrincipales.map((estacion) => {
          const sinSeleccion = !modoRecepcion(estacion)
          return (
            <article key={estacion.codigo} className={`min-w-0 rounded-xl border p-4 ${sinSeleccion ? 'border-amber-500/40 bg-amber-500/10' : 'border-surface-700 bg-surface-900/70'}`}>
              <h4 className="font-bold text-zinc-100">{ETIQUETA_ESTACION[estacion.codigo]}</h4>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">{resumenRecepcion(estacion)}</p>
            </article>
          )
        })}
      </div>
      <p className="rounded-lg border border-surface-700 bg-surface-900/70 p-3 text-sm leading-relaxed text-zinc-300">Esta configuración se aplicará solo a los pedidos nuevos. Los pedidos anteriores no cambiarán.</p>
    </div>
  )

  return (
    <section className="space-y-6" aria-label="Configuración operativa">
      <PageHeader titulo="Configuración operativa" descripcion="Elige cómo recibirá los pedidos cada área del restaurante. Puedes usar una pantalla, una impresora o ambas." />
      {config.solo_lectura && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200" role="status">
          {config.limitacion ?? 'La configuración está disponible en modo consulta.'} Por ahora puedes revisar las opciones guardadas, pero no modificarlas.
        </div>
      )}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert" aria-live="assertive">{error}</div>}
      {aviso && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200" role="status" aria-live="polite">{aviso}</div>}

      {restauranteId && <PoliticaCobro restauranteId={restauranteId} onAplicada={(modalidad) => setConfig((actual) => actual ? { ...actual, modalidad_cobro: modalidad } : actual)} />}

      <section className="space-y-4" aria-label="Cómo reciben pedidos Cocina y Barra">
        <div>
          <h2 id="estaciones-titulo" className="text-lg font-extrabold text-zinc-100">Cómo reciben pedidos Cocina y Barra</h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">Elige una forma de trabajo para cada área. Puedes cambiarla más adelante; el cambio se aplicará a los pedidos nuevos.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {estacionesPrincipales.map((estacion) => {
            const modoActual = modoRecepcion(estacion)
            const resumen = resumenRecepcion(estacion)
            return (
              <article key={estacion.codigo} className="card min-w-0 p-4 sm:p-6" aria-label={`Pedidos de ${ETIQUETA_ESTACION[estacion.codigo]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-extrabold text-zinc-100">{ETIQUETA_ESTACION[estacion.codigo]}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-300">{resumen}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${!modoActual ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                    {!modoActual ? 'Elige una opción' : 'Configurado'}
                  </span>
                </div>
                <fieldset className="mt-5 min-w-0" disabled={!editando || guardando}>
                  <legend className="mb-3 text-sm font-bold text-zinc-200">Elige cómo recibir pedidos</legend>
                  <div className="grid min-w-0 gap-3">
                    {opcionesRecepcion.map((opcion) => {
                      const seleccionado = modoActual === opcion.id
                      return (
                        <label key={opcion.id} className={`flex min-h-16 min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400 ${seleccionado ? 'border-brand-400 bg-brand-500/10' : 'border-surface-700 bg-surface-900/60 hover:border-surface-500'} ${!editando || guardando ? 'cursor-not-allowed opacity-60' : ''}`}>
                          <input type="radio" name={`recepcion-${estacion.codigo}`} value={opcion.id} checked={seleccionado} disabled={!editando || guardando} onChange={() => cambiarModoRecepcion(estacion.codigo, opcion.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500" />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-zinc-100">{opcion.titulo}</span>
                            <span className="mt-1 block text-sm leading-relaxed text-zinc-400">{opcion.descripcion}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
                {!modoActual && <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-100" role="status">Por ahora, los pedidos nuevos de {ETIQUETA_ESTACION[estacion.codigo]} no aparecerán en una pantalla ni se imprimirán. Elige una de las opciones para activarlos.</p>}
              </article>
            )
          })}
        </div>
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby="resumen-operativo-titulo">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="resumen-operativo-titulo" className="text-lg font-extrabold text-zinc-100">Así recibirán los pedidos</h2>
            <p className="mt-1 text-sm text-zinc-400">Revisa cada área antes de confirmar.</p>
          </div>
          <button type="button" aria-busy={guardando} disabled={!editando || guardando} onClick={() => { setError(null); setConfirmarGuardar(true) }} className="btn btn-primary min-h-11 w-full rounded-xl px-5 py-2.5 shadow-md shadow-brand-500/15 disabled:opacity-60 sm:w-auto">Guardar configuración</button>
        </div>
        {resumen}
      </section>

      {confirmarGuardar && (
        <Modal titulo="Confirma la configuración" onCerrar={() => !guardando && setConfirmarGuardar(false)} ancho="max-w-3xl">
          <p className="mb-5 text-sm leading-relaxed text-zinc-300">Se guardará cómo recibe los pedidos cada área de <strong>{restaurante?.nombre}</strong>. El cambio se aplicará solo a los pedidos nuevos; los anteriores conservarán su configuración.</p>
          {resumen}
          {error && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={guardando} onClick={() => setConfirmarGuardar(false)} className="btn btn-outline min-h-11 rounded-xl px-4 py-2.5">Seguir editando</button>
            <button type="button" aria-busy={guardando} disabled={guardando} onClick={() => void guardar()} className="btn btn-primary min-h-11 rounded-xl px-5 py-2.5 shadow-md shadow-brand-500/15 disabled:opacity-60">{guardando ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> Guardando configuración…</> : 'Guardar configuración'}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
