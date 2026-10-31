// =============================================================================
// Mesora · genera supabase/TODO_EN_UNO.sql
// =============================================================================
// Un solo archivo con TODO el SQL del proyecto concatenado en el orden correcto,
// para pegar de una vez en el SQL Editor de Supabase. Ese archivo es lo único
// que se pega; `supabase/fuentes/` es el detalle interno de mantenimiento.
//
// Por qué un script generador y no un archivo escrito a mano: el orden importa
// (el schema antes que las migraciones, RLS al final) y copiar 2.500 líneas a
// mano es una fuente garantizada de drift. Acá el orden vive en una lista, el
// contenido sale de los archivos que ya están, y `verificar` corre los chequeos.
//
//   npm run sql:install
//
// El resultado es determinista: el mismo código produce el mismo archivo, así que
// regenerarlo no ensucia el diff.
// =============================================================================
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

// Las piezas viven en `supabase/fuentes/`, en subcarpeta, para que la raíz de
// `supabase/` tenga un solo archivo visible — el que se pega. Ver el orden abajo.
const DIR = join(RAIZ, 'supabase', 'fuentes')
const MIGRACIONES = join(RAIZ, 'supabase', 'migrations')
const SALIDA = join(RAIZ, 'supabase', 'TODO_EN_UNO.sql')

// El archivo que genera este script. No es fuente: por eso el chequeo de
// cobertura lo ignora (si no, la segunda corrida fallaría porque no está en
// ORDEN, que es solo para los archivos que hay que mantener).
const GENERADOS = ['TODO_EN_UNO.sql']

// -----------------------------------------------------------------------------
// EL ORDEN. Es el único lugar del proyecto donde está la secuencia completa.
// -----------------------------------------------------------------------------
// Cada archivo tiene una dependencia real del anterior:
//   - el schema define las tablas que todo lo demás altera;
//   - 00_seguridad define validar_acceso_restaurante, del que dependen todas las RPC;
//   - pin_autorizacion define validar_pin_autorizacion, del que dependen anular_item
//     y anular_cuenta;
//   - 01_rls hace grant sobre funciones que los anteriores crean, y revoca sobre
//     tablas que los anteriores crean; también define soy_super_admin(), del que
//     dependen las policies de los módulos de Super Admin (por eso van después);
//   - suscripciones crea suscripciones_historial, sobre la que auditaría dispara
//     sus triggers; soporte crea soporte_tickets, que configuración consulta;
//     auditoría crea audit_logs, en la que configuración inserta.
//   - migracion_password_recovery altera `usuarios`, que ya existe desde el
//     schema base, y va antes de que RLS reparta los permisos de esa tabla.
// -----------------------------------------------------------------------------
const ORDEN = [
  '00_schema_base.sql',
  '00_seguridad_rpcs.sql',
  'migracion_items_anulables.sql',
  'migracion_productos_es_bebida.sql',
  '../migrations/20261031073322_reporte_ventas_y_snapshot_bebidas.sql',
  'migracion_password_recovery.sql',
  '../migrations/20261029052901_datos_local_dominio.sql',
  'pin_autorizacion.sql',
  'rpc_crear_pedido.sql',
  'rpc_cerrar_cuenta.sql',
  'rpc_anular_cuenta.sql',
  'caja_turnos.sql',
  '01_rls_completo.sql',
  'admin_super_restaurante.sql',
  'usuarios_super_admin.sql',
  'estadisticas_super_admin.sql',
  'soporte.sql',
  'suscripciones_super_admin.sql',
  'auditoria.sql',
  'configuracion_global.sql',
  'seguridad_piloto.sql',
  '../migrations/20261030173318_seguridad_rpc_piloto.sql',
  '../migrations/20261030173320_consultas_pendientes_piloto.sql',
  '../migrations/20261030173503_diagnostico_piloto.sql',
  '../migrations/20261030173925_indice_mesas_zona.sql',
]

const fallos = []
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? '  OK  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  if (!ok) fallos.push(`${nombre}${detalle ? `: ${detalle}` : ''}`)
}

// -----------------------------------------------------------------------------
// 1. Todo archivo de supabase/*.sql tiene que estar en la lista.
// -----------------------------------------------------------------------------
// Sin este chequeo, alguien crea `supabase/migracion_nueva.sql`, se le olvida
// agregarla acá, y la instalación "sale bien" pero sin la migración: el fallo
// aparece semanas después, en producción, y no en el paso que lo causó.
const enDisco = [
  ...readdirSync(DIR),
  ...(existsSync(MIGRACIONES) ? readdirSync(MIGRACIONES).map((f) => `../migrations/${f}`) : []),
]
  .filter((f) => f.endsWith('.sql') && !GENERADOS.includes(f))
  .sort()
const faltantes = enDisco.filter((f) => !ORDEN.includes(f))
const sobrantes = ORDEN.filter((f) => !enDisco.includes(f))

console.log('\n1) Cobertura de la lista de orden')
check('todo supabase/*.sql está en ORDEN', faltantes.length === 0, faltantes.join(', '))
check('todo ORDEN existe en disco', sobrantes.length === 0, sobrantes.join(', '))

if (fallos.length) {
  console.log('\nNo se genera INSTALL.sql hasta que la lista esté completa.\n')
  process.exit(1)
}

// -----------------------------------------------------------------------------
// 2. Sanidad de cada archivo antes de concatenar.
// -----------------------------------------------------------------------------
console.log('\n2) Sanidad de cada archivo')
const contenidos = []
for (const archivo of ORDEN) {
  // Mismo instalador y hash en Windows/CRLF y Linux/LF (incluido CI).
  const texto = readFileSync(join(DIR, archivo), 'utf8').replace(/\r\n?/g, '\n')
  contenidos.push({ archivo, texto })

  const delimitadores = (texto.match(/\$\$/g) ?? []).length
  const abreB = texto.match(/^\s*(begin|declare)\b/gim)?.length ?? 0
  const cierraB = texto.match(/^\s*end;\s*(--.*)?$/gim)?.length ?? 0
  const balanceado = delimitadores % 2 === 0 && cierraB <= abreB
  const sucio = /[\uFFFD]/.test(texto)
  const comentarioSlash = /^\s*\/\//m.test(texto)
  const sinBasura = !sucio && !comentarioSlash

  check(
    `${archivo} (${texto.length} bytes)`,
    balanceado && sinBasura,
    [
      delimitadores % 2 !== 0 ? '$$ impar' : '',
      cierraB > abreB ? `end; (${cierraB}) > begin/declare (${abreB})` : '',
      sucio ? 'caracter U+FFFD' : '',
      comentarioSlash ? 'comentario //' : '',
    ]
      .filter(Boolean)
      .join(', '),
  )

}

// -----------------------------------------------------------------------------
// 3. El SQL Editor manda el script entero en un solo lote. Si algo está mal,
//    duele enterarse al escribirlo y no a mitad de una instalación.
// -----------------------------------------------------------------------------
const peligroso = contenidos.filter((c) => /^\s*(drop\s+table|truncate)\b/im.test(c.texto))
check('ningún archivo borra tablas', peligroso.length === 0, peligroso.map((c) => c.archivo).join(', '))

// -----------------------------------------------------------------------------
// 4. Concatenar.
// -----------------------------------------------------------------------------
const SEPARADOR = (i) =>
  [
    '',
    '',
    `-- #############################################################################`,
    `-- # ${i + 1}/${ORDEN.length} · ${ORDEN[i]}`,
    `-- #############################################################################`,
    '',
    '',
  ].join('\n')

const cuerpo = contenidos.map((c, i) => `${SEPARADOR(i)}-- ${c.texto.trim()}\n`).join('')

const hash = createHash('sha256').update(cuerpo).digest('hex').slice(0, 12)

const cabecera = `-- =============================================================================
-- Mesora · TODO_EN_UNO.sql — PEGA ESTE ARCHIVO ENTERO EN EL SQL EDITOR
-- =============================================================================
-- Levantá la base de datos de Mesora desde cero: tablas, funciones, permisos,
-- RLS y permisos de produccion. No crea usuarios ni datos de prueba.
--
-- COMO USARLO
--   1. Abre SQL Editor, crea una consulta, pega TODO este archivo y ejecuta.
--   2. Configura un super_admin inicial segun SUPABASE_SETUP.md y crea
--      el restaurante piloto desde la plataforma.
--
-- DESPUES DE APLICARLO
--   Copiá la URL y la anon key del proyecto a tu .env.local y reiniciá Vite.
--
-- NOTAS
--   - No crea cuentas ni datos de prueba. Respalda la base y revisa el
--     impacto antes de aplicarlo a un proyecto que ya contiene datos.
--   - Si algo falla, los comentarios de bloque indican donde revisar.
--   - Generado por npm run sql:install. Edita los fuentes, no este archivo.
--
-- Contenido: ${contenidos.length} archivos · sha256(cuerpo) = ${hash}
-- Orden: ${ORDEN.join(' → ')}
-- =============================================================================

`

const salida = cabecera + cuerpo
writeFileSync(SALIDA, salida, 'utf8')

console.log('\n3) Resultado')
console.log(`  supabase/TODO_EN_UNO.sql · ${salida.length} bytes · ${salida.split('\n').length} líneas · sha256(cuerpo) = ${hash}`)
console.log(`  orden: ${ORDEN.join(' → ')}`)

if (fallos.length) {
  console.log(`\nNo se genera TODO_EN_UNO.sql hasta que la lista esté completa.\n`)
  process.exit(1)
}
console.log('\nOK: TODO_EN_UNO.sql generado.\n')
