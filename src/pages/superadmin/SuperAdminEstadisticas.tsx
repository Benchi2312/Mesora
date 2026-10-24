import { useCallback, useEffect, useMemo, useState } from 'react'
import { getApi } from '../../lib/api'
import { fmtPEN } from '../../lib/format'
import {
  PRESETS_RANGO,
  etiquetaDia,
  ordenarRanking,
  rangoDePreset,
  type CriterioRanking,
  type EstadisticasGlobales,
  type PuntoSerie,
} from '../../lib/estadisticas'
import type { PresetRango } from '../../lib/estadisticas'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'

const numero = (n: number) => n.toLocaleString('es-PE')

function Tarjeta({
  etiqueta,
  valor,
  clase,
  nota,
}: {
  etiqueta: string
  valor: string | number
  clase: string
  nota?: string
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{etiqueta}</p>
      <p className={`mt-2 text-3xl font-extrabold ${clase}`}>{valor}</p>
      {nota && <p className="mt-1 text-xs text-zinc-500">{nota}</p>}
    </div>
  )
}

/**
 * Gráfico de barras sin dependencias: una barra por día del periodo. Los ceros
 * se dibujan como una línea base, para que se vea la continuidad del eje.
 */
function GraficoSerie({
  titulo,
  puntos,
  moneda = false,
}: {
  titulo: string
  puntos: PuntoSerie[]
  moneda?: boolean
}) {
  const max = Math.max(1, ...puntos.map((p) => p.valor))
  const total = puntos.reduce((a, p) => a + p.valor, 0)
  const formato = (n: number) => (moneda ? fmtPEN(n) : numero(n))
  // Con muchos días se etiquetan solo algunos, para que no se pisen entre sí.
  const paso = Math.max(1, Math.ceil(puntos.length / 7))

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">{titulo}</h3>
        <span className="text-sm font-semibold text-zinc-200">{formato(total)}</span>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Sin datos en el periodo.</p>
      ) : (
        <>
          <div className="flex h-36 items-end gap-1" role="img" aria-label={`${titulo}: ${formato(total)}`}>
            {puntos.map((p) => (
              <div
                key={p.fecha}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${etiquetaDia(p.fecha)} · ${formato(p.valor)}`}
              >
                <div
                  className={`w-full rounded-t ${
                    p.valor > 0 ? 'bg-brand-500/70' : 'bg-surface-700'
                  }`}
                  style={{ height: p.valor > 0 ? `${Math.max(4, (p.valor / max) * 100)}%` : '2px' }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {puntos.map((p, i) => (
              <span key={p.fecha} className="flex-1 text-center text-[10px] text-zinc-500">
                {i % paso === 0 || i === puntos.length - 1 ? etiquetaDia(p.fecha) : ''}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default function SuperAdminEstadisticas() {
  const [preset, setPreset] = useState<PresetRango>('7d')
  const [datos, setDatos] = useState<EstadisticasGlobales | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [criterio, setCriterio] = useState<CriterioRanking>('ventas')

  const cargar = useCallback(async (p: PresetRango) => {
    setCargando(true)
    setError(null)
    const { desde, hasta } = rangoDePreset(p)
    const res = await getApi().getEstadisticasGlobales(desde, hasta)
    if (res.error) {
      setError(res.error)
      setDatos(null)
    } else {
      setDatos(res.data)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar(preset)
  }, [preset, cargar])

  const ranking = useMemo(
    () => (datos ? ordenarRanking(datos.ranking, criterio) : []),
    [datos, criterio],
  )

  if (cargando && !datos)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  if (error)
    return (
      <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudieron cargar las estadísticas. {error}
      </div>
    )

  if (!datos) return null

  const { resumen, comparaciones, evolucion } = datos
  const rango = `${etiquetaDia(evolucion.pedidos[0]?.fecha ?? '')} — ${
    evolucion.pedidos.length > 0
      ? etiquetaDia(evolucion.pedidos[evolucion.pedidos.length - 1].fecha)
      : ''
  }`

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo de las estadísticas">
          {PRESETS_RANGO.map((p) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => setPreset(p.clave)}
              aria-pressed={preset === p.clave}
              className={`min-h-11 touch-manipulation rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
                preset === p.clave
                  ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                  : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500 hover:text-white'
              }`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          Periodo: {rango}
          {cargando && ' · actualizando…'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tarjeta
          etiqueta="Restaurantes registrados"
          valor={numero(resumen.restaurantesRegistrados)}
          clase="text-zinc-100"
          nota="Altas totales de la plataforma"
        />
        <Tarjeta
          etiqueta="Restaurantes activos"
          valor={numero(resumen.restaurantesActivos)}
          clase="text-ok-500"
          nota="Con suscripción vigente hoy"
        />
        <Tarjeta
          etiqueta="Usuarios"
          valor={numero(resumen.usuarios)}
          clase="text-zinc-100"
          nota={`${numero(resumen.usuariosActivos)} activos`}
        />
        <Tarjeta
          etiqueta="Administradores"
          valor={numero(resumen.administradores)}
          clase="text-zinc-100"
          nota="De restaurante y de la plataforma"
        />
        <Tarjeta
          etiqueta="Pedidos"
          valor={numero(resumen.pedidos)}
          clase="text-brand-400"
          nota="Comandas creadas en el periodo"
        />
        <Tarjeta
          etiqueta="Ventas"
          valor={fmtPEN(resumen.ventas)}
          clase="text-brand-400"
          nota="Cuentas pagadas del periodo"
        />
        <Tarjeta
          etiqueta="Restaurantes nuevos"
          valor={numero(resumen.restaurantesNuevos)}
          clase="text-ok-500"
          nota="Altas dentro del periodo"
        />
      </div>

      <section className="card mt-8 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-zinc-400">
          Comparación rápida
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Independiente del periodo elegido: hoy, esta semana (lunes) y este mes en curso.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-zinc-500">
                <th className="py-2 pr-4 font-semibold">Indicador</th>
                <th className="py-2 pr-4 text-right font-semibold">Hoy</th>
                <th className="py-2 pr-4 text-right font-semibold">Esta semana</th>
                <th className="py-2 text-right font-semibold">Este mes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              <tr>
                <td className="py-2.5 pr-4 text-zinc-300">Pedidos</td>
                <td className="py-2.5 pr-4 text-right font-semibold text-zinc-100">{numero(comparaciones.pedidos.hoy)}</td>
                <td className="py-2.5 pr-4 text-right font-semibold text-zinc-100">{numero(comparaciones.pedidos.semana)}</td>
                <td className="py-2.5 text-right font-semibold text-zinc-100">{numero(comparaciones.pedidos.mes)}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-zinc-300">Ventas</td>
                <td className="py-2.5 pr-4 text-right font-semibold text-zinc-100">{fmtPEN(comparaciones.ventas.hoy)}</td>
                <td className="py-2.5 pr-4 text-right font-semibold text-zinc-100">{fmtPEN(comparaciones.ventas.semana)}</td>
                <td className="py-2.5 text-right font-semibold text-zinc-100">{fmtPEN(comparaciones.ventas.mes)}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-zinc-300">Restaurantes nuevos</td>
                <td className="py-2.5 pr-4 text-right font-semibold text-zinc-100">{numero(comparaciones.restaurantesNuevos.hoy)}</td>
                <td className="py-2.5 pr-4 text-right font-semibold text-zinc-100">{numero(comparaciones.restaurantesNuevos.semana)}</td>
                <td className="py-2.5 text-right font-semibold text-zinc-100">{numero(comparaciones.restaurantesNuevos.mes)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mt-8 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
            Restaurantes más activos
          </h2>
          <div className="flex gap-2" role="group" aria-label="Criterio del ranking">
            {(['ventas', 'pedidos'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCriterio(c)}
                aria-pressed={criterio === c}
                className={`btn min-h-9 px-3 text-xs ${
                  criterio === c ? 'bg-brand-500/15 text-brand-400' : 'btn-outline'
                }`}
              >
                Por {c}
              </button>
            ))}
          </div>
        </div>

        {ranking.length === 0 ? (
          <EstadoVacio
            titulo="Sin actividad en el periodo"
            descripcion="Ningún restaurante registró pedidos ni ventas en el rango elegido."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-zinc-500">
                  <th className="py-2 pr-3 font-semibold">#</th>
                  <th className="py-2 pr-4 font-semibold">Restaurante</th>
                  <th className="py-2 pr-4 text-right font-semibold">Pedidos</th>
                  <th className="py-2 text-right font-semibold">Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {ranking.map((f, i) => (
                  <tr key={f.restauranteId}>
                    <td className="py-2.5 pr-3 text-zinc-500">{i + 1}</td>
                    <td className="py-2.5 pr-4 font-semibold text-zinc-100">{f.nombre}</td>
                    <td className="py-2.5 pr-4 text-right text-zinc-300">{numero(f.pedidos)}</td>
                    <td className="py-2.5 text-right font-semibold text-zinc-100">{fmtPEN(f.ventas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 className="mb-4 mt-8 text-sm font-bold uppercase tracking-widest text-zinc-400">
        Evolución en el periodo
      </h2>
      <div className="grid gap-5 lg:grid-cols-3">
        <GraficoSerie titulo="Restaurantes nuevos" puntos={evolucion.restaurantes} />
        <GraficoSerie titulo="Pedidos" puntos={evolucion.pedidos} />
        <GraficoSerie titulo="Ventas" puntos={evolucion.ventas} moneda />
      </div>
    </div>
  )
}
