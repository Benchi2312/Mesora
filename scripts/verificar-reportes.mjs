import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const ENV_DIR = mkdtempSync(join(tmpdir(), 'mesora-reportes-env-'))
const server = await createServer({
  root: RAIZ,
  envDir: ENV_DIR,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true },
})

let checks = 0
const check = (nombre, prueba) => {
  checks++
  assert.ok(prueba, nombre)
  console.log(`  OK  ${nombre}`)
}

try {
  const {
    crearCsv, crearNombreCsv, diasEntreFechas, fechaDeHoy, inicioDeDiaEnZona,
    nombrePeriodoArchivo, periodoAnterior, rangoApi, rangoRapido, rangoUtc,
    sumarDiasCalendario,
  } = await server.ssrLoadModule('/src/domain/reporting/reportesAdmin.ts')

  const hoy = '2026-11-15'
  check('fecha actual respeta el calendario America/Lima', fechaDeHoy('America/Lima', new Date('2026-11-15T04:30:00Z')) === '2026-11-14')
  check('hoy produce un día inclusivo', JSON.stringify(rangoRapido('hoy', hoy)) === JSON.stringify({ desde: hoy, hasta: hoy }))
  check('últimos siete días incluyen hoy y seis días anteriores', JSON.stringify(rangoRapido('ultimos7', hoy)) === JSON.stringify({ desde: '2026-11-09', hasta: hoy }))
  check('este mes inicia el primer día y termina hoy', JSON.stringify(rangoRapido('esteMes', hoy)) === JSON.stringify({ desde: '2026-11-01', hasta: hoy }))
  check('mes anterior incluye todo octubre', JSON.stringify(rangoRapido('mesAnterior', hoy)) === JSON.stringify({ desde: '2026-10-01', hasta: '2026-10-31' }))
  check('mes seleccionado incluye febrero bisiesto completo', JSON.stringify(rangoRapido('mesSeleccionado', hoy, '2024-02')) === JSON.stringify({ desde: '2024-02-01', hasta: '2024-02-29' }))
  check('rango personalizado se conserva', JSON.stringify(rangoRapido('personalizado', hoy, undefined, { desde: '2026-01-30', hasta: '2026-02-03' })) === JSON.stringify({ desde: '2026-01-30', hasta: '2026-02-03' }))
  check('la fecha hasta se convierte a límite exclusivo en Lima', JSON.stringify(rangoUtc({ desde: '2026-11-15', hasta: '2026-11-15' })) === JSON.stringify({ desde: '2026-11-15T05:00:00.000Z', hasta: '2026-11-16T05:00:00.000Z' }))
  check('la conversión usa reglas de zona horaria y respeta cambio DST', JSON.stringify(rangoUtc({ desde: '2026-03-08', hasta: '2026-03-08' }, 'America/New_York')) === JSON.stringify({ desde: '2026-03-08T05:00:00.000Z', hasta: '2026-03-09T04:00:00.000Z' }))
  check('periodo anterior usa igual cantidad de días sin traslaparse', JSON.stringify(periodoAnterior({ desde: '2026-11-10', hasta: '2026-11-15' })) === JSON.stringify({ desde: '2026-11-04', hasta: '2026-11-09' }))
  check('un mes calendario compara con el mes calendario previo completo', JSON.stringify(periodoAnterior({ desde: '2026-11-01', hasta: '2026-11-30' })) === JSON.stringify({ desde: '2026-10-01', hasta: '2026-10-31' }))
  check('diferencia de fechas soporta cruces de mes y año', diasEntreFechas('2026-12-29', '2027-01-02') === 4 && sumarDiasCalendario('2026-12-31', 1) === '2027-01-01')
  check('RPC recibe filtros activos y fechas de zona convertidas', JSON.stringify(rangoApi({ desde: '2026-11-01', hasta: '2026-11-30' }, { estado: 'anulada', mesero_id: 'u-1', producto_id: 'p-1', busqueda: 'B001', offset: 25, limite: 25 })).includes('2026-11-01T05:00:00.000Z'))
  check('mes calendario usa nombre breve y rango parcial conserva ambas fechas', nombrePeriodoArchivo({ desde: '2026-11-01', hasta: '2026-11-30' }) === '2026-11' && nombrePeriodoArchivo({ desde: '2026-11-02', hasta: '2026-11-30' }) === '2026-11-02-a-2026-11-30')
  check('nombre CSV mensual coincide con el formato de producto', crearNombreCsv('meseros', { desde: '2026-11-01', hasta: '2026-11-30' }) === 'mesora-meseros-2026-11.csv')

  const csv = crearCsv(['Nombre', 'Importe'], [['Restaurante, "Sol"', 12.5], ['=HYPERLINK("x")', -1.2]])
  check('CSV tiene BOM UTF-8, separador Excel y finales CRLF', csv.charCodeAt(0) === 0xfeff && csv.includes(';') && csv.includes('\r\n'))
  check('CSV escapa comillas, usa decimal peruano y neutraliza fórmulas', csv.includes('"Restaurante, ""Sol""";"12,50"') && csv.includes('"\'=HYPERLINK(""x"")";"-1,20"'))

  const { movimientosPorDia } = await server.ssrLoadModule('/src/domain/reporting/graficosAdmin.ts')
  const unDia = movimientosPorDia({
    ventas_por_dia: [{ fecha: '2026-11-15', ventas: 25, cuentas: 1 }],
    reembolsos_por_dia: [{ fecha: '2026-11-15', reembolsos: 5 }],
  })
  check('un solo día combina cobro y devolución en una barra doble', unDia.length === 1 && unDia[0].cobrado === 25 && unDia[0].reembolsado === 5)
  check('periodo vacío no inventa barras', movimientosPorDia({ ventas_por_dia: [], reembolsos_por_dia: [] }).length === 0)
  const repetidos = movimientosPorDia({
    ventas_por_dia: [{ fecha: '2026-11-15', ventas: 10, cuentas: 1 }, { fecha: '2026-11-15', ventas: 15, cuentas: 1 }],
    reembolsos_por_dia: [{ fecha: '2026-11-15', reembolsos: 5 }],
  })
  check('datos repetidos se agrupan por fecha sin duplicar el día', repetidos.length === 1 && repetidos[0].cobrado === 25 && repetidos[0].cuentas === 2)

  const { GraficoDiario, GraficoMeseros, GraficoProductos } = await server.ssrLoadModule('/src/pages/admin/GraficosReportes.tsx')
  const diarioHtml = renderToStaticMarkup(createElement(GraficoDiario, { reporte: { ventas_por_dia: [{ fecha: '2026-11-15', ventas: 25, cuentas: 1 }], reembolsos_por_dia: [{ fecha: '2026-11-15', reembolsos: 5 }] } }))
  check('gráfico diario incluye leyenda y tabla alternativa', diarioHtml.includes('Devuelto tras anulación') && diarioHtml.includes('Ver datos en tabla') && diarioHtml.includes('2026-11-15'))
  const meserosGrafico = Array.from({ length: 7 }, (_, i) => ({ id: `u-${i}`, nombre: `Mesero ${i}`, cuentas: i + 1, ventas: 70 - i * 5 }))
  const rankingHtml = renderToStaticMarkup(createElement(GraficoMeseros, { meseros: meserosGrafico, verTodos: false, alCambiar: () => {} }))
  check('ranking muestra cinco y ofrece ver todos', rankingHtml.includes('Ver todos (7)') && !rankingHtml.includes('Mesero 6'))
  const productosGrafico = Array.from({ length: 6 }, (_, i) => ({ id: `p-${i}`, nombre: `Producto ${i}`, es_bebida: false, cantidad: 6 - i, total: 60 - i * 10 }))
  const productosHtml = renderToStaticMarkup(createElement(GraficoProductos, { productos: productosGrafico, orden: 'cantidad' }))
  check('productos muestran cinco barras y tabla alternativa', productosHtml.includes('Producto 4') && !productosHtml.includes('Producto 5') && productosHtml.includes('Ver datos en tabla'))
  console.log(`REPORTES QA OK: ${checks} comprobaciones.`)
} finally {
  await server.close()
  rmSync(ENV_DIR, { recursive: true, force: true })
}
