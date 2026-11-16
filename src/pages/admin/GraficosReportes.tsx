import { movimientosPorDia } from '../../domain/reporting/graficosAdmin'
import type { ReporteAdminDetallado } from '../../domain/reporting/ventas'
import { fmtPEN } from '../../lib/format'

const money = (valor: number) => fmtPEN(valor)

function BarraValor({ valor, maximo, clase }: { valor: number; maximo: number; clase: string }) {
  const ancho = valor > 0 && maximo > 0 ? Math.max(3, valor / maximo * 100) : 0
  return <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-surface-700">
    <div className={`h-full rounded-full ${clase}`} style={{ width: `${ancho}%` }} />
  </div>
}

function TablaAlternativa({ columnas, filas }: { columnas: string[]; filas: string[][] }) {
  return <details className="mt-4 border-t border-surface-700 pt-3 text-sm">
    <summary className="w-fit cursor-pointer font-semibold text-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400">Ver datos en tabla</summary>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead><tr>{columnas.map((columna) => <th key={columna} scope="col" className="pb-2 pr-2 font-semibold text-zinc-400">{columna}</th>)}</tr></thead>
        <tbody>{filas.map((fila, indice) => <tr key={`${fila[0]}-${indice}`} className="border-t border-surface-700/70">{fila.map((valor, posicion) => <td key={posicion} className="break-words py-2 pr-2 text-zinc-300">{valor}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </details>
}

export function GraficoDiario({ reporte }: { reporte: ReporteAdminDetallado }) {
  if (!Array.isArray(reporte.reembolsos_por_dia)) {
    return <section className="card p-4 sm:p-5" aria-label="Cobros y devoluciones por día"><h3 className="titulo-seccion">Cobros y devoluciones por día</h3><p role="alert" className="mt-3 text-sm text-warning-400">No se recibió el desglose diario de devoluciones. Actualiza el reporte para intentarlo de nuevo.</p></section>
  }
  const dias = movimientosPorDia(reporte)
  const maximo = Math.max(0, ...dias.flatMap((dia) => [dia.cobrado, dia.reembolsado]))
  return <section className="card p-4 sm:p-5" aria-label="Cobros y devoluciones por día">
    <h3 className="titulo-seccion">Cobros y devoluciones por día</h3>
    <p className="mt-1 text-sm text-zinc-500">Importes del periodo completo. Las devoluciones usan el mismo monto que el resumen.</p>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400" aria-label="Leyenda del gráfico"><span><i aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" />Cobrado</span><span><i aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-danger-500" />Devuelto tras anulación</span></div>
    {!dias.length ? <p className="py-5 text-sm text-zinc-500">No hubo cobros ni devoluciones en este periodo.</p> : <>
      <div role="img" aria-label={`Barras diarias de cobros y devoluciones: ${dias.length} ${dias.length === 1 ? 'día' : 'días'} con movimientos`} className={`mt-4 space-y-4 ${dias.length === 1 ? 'max-w-xl' : ''}`}>
        {dias.map((dia) => <div key={dia.fecha} className="min-w-0 border-b border-surface-700/50 pb-3 last:border-0 last:pb-0">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1 text-sm"><strong className="text-zinc-200">{dia.fecha}</strong><span className="text-xs text-zinc-500">{dia.cuentas} {dia.cuentas === 1 ? 'cuenta cobrada' : 'cuentas cobradas'}</span></div>
          <div className="space-y-2">
            <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-xs sm:grid-cols-[5.5rem_minmax(0,1fr)_6rem]"><span className="text-zinc-400">Cobrado</span><BarraValor valor={dia.cobrado} maximo={maximo} clase="bg-brand-500" /><strong className="col-start-2 tabular-nums text-zinc-200 sm:col-start-3 sm:text-right">{money(dia.cobrado)}</strong></div>
            <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-xs sm:grid-cols-[5.5rem_minmax(0,1fr)_6rem]"><span className="text-zinc-400">Devuelto</span><BarraValor valor={dia.reembolsado} maximo={maximo} clase="bg-danger-500" /><strong className="col-start-2 tabular-nums text-zinc-200 sm:col-start-3 sm:text-right">{money(dia.reembolsado)}</strong></div>
          </div>
        </div>)}
      </div>
      <TablaAlternativa columnas={['Día', 'Cobrado', 'Devuelto', 'Cuentas']} filas={dias.map((dia) => [dia.fecha, money(dia.cobrado), money(dia.reembolsado), String(dia.cuentas)])} />
    </>}
  </section>
}

export function GraficoMeseros({ meseros, verTodos, alCambiar }: { meseros: ReporteAdminDetallado['meseros']; verTodos: boolean; alCambiar: () => void }) {
  if (!meseros.length) return null
  const ordenados = [...meseros].sort((a, b) => b.ventas - a.ventas || a.nombre.localeCompare(b.nombre))
  const visibles = verTodos ? ordenados : ordenados.slice(0, 5)
  const maximo = ordenados[0]?.ventas ?? 0
  return <section aria-label="Ranking de meseros" className="mb-5 rounded-xl border border-surface-700 bg-surface-900/40 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-zinc-100">Ranking por importe vendido</h3>{ordenados.length > 5 && <button type="button" className="btn btn-outline min-h-11 px-3" aria-expanded={verTodos} onClick={alCambiar}>{verTodos ? 'Ver cinco primeros' : `Ver todos (${ordenados.length})`}</button>}</div>
    <div role="img" aria-label={`Ranking por ventas atribuidas de ${visibles.length} meseros`} className="mt-4 space-y-3">
      {visibles.map((fila, indice) => <div key={fila.id ?? `${fila.nombre}-${indice}`} className="min-w-0"><div className="mb-1 flex flex-wrap justify-between gap-x-3 text-sm"><span className="min-w-0 break-words text-zinc-200">{indice + 1}. {fila.nombre} <span className="text-xs text-zinc-500">· {fila.cuentas} cuentas</span></span><strong className="tabular-nums">{money(fila.ventas)}</strong></div><BarraValor valor={fila.ventas} maximo={maximo} clase="bg-brand-500" /></div>)}
    </div>
    <TablaAlternativa columnas={['Puesto', 'Mesero', 'Vendido', 'Cuentas']} filas={visibles.map((fila, indice) => [String(indice + 1), fila.nombre, money(fila.ventas), String(fila.cuentas)])} />
  </section>
}

export function GraficoProductos({ productos, orden }: { productos: ReporteAdminDetallado['productos']; orden: 'cantidad' | 'importe' }) {
  if (!productos.length) return null
  const principales = productos.slice(0, 5)
  const valor = (fila: ReporteAdminDetallado['productos'][number]) => orden === 'cantidad' ? fila.cantidad : fila.total
  const maximo = Math.max(0, ...principales.map(valor))
  return <section aria-label="Cinco productos principales" className="mt-4 rounded-xl border border-surface-700 bg-surface-900/40 p-3 sm:p-4">
    <h3 className="font-semibold text-zinc-100">Cinco principales por {orden === 'cantidad' ? 'cantidad' : 'importe'}</h3>
    <div role="img" aria-label={`Barras de los ${principales.length} productos principales, ordenados por ${orden}`} className="mt-4 space-y-3">
      {principales.map((fila, indice) => <div key={`${fila.id ?? fila.nombre}-${fila.es_bebida}`} className="min-w-0"><div className="mb-1 flex flex-wrap justify-between gap-x-3 text-sm"><span className="min-w-0 break-words text-zinc-200">{indice + 1}. {fila.nombre}</span><strong className="tabular-nums">{orden === 'cantidad' ? `${fila.cantidad} unid.` : money(fila.total)}</strong></div><BarraValor valor={valor(fila)} maximo={maximo} clase="bg-brand-500" /></div>)}
    </div>
    <TablaAlternativa columnas={['Producto', 'Cantidad', 'Importe']} filas={principales.map((fila) => [fila.nombre, String(fila.cantidad), money(fila.total)])} />
  </section>
}
