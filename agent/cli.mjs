#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin as entrada, stdout as salida } from 'node:process'
import { crearTransporte } from './transport.mjs'
import { ImpresoraWindows } from './windows-printer.mjs'
import { almacenAgente } from './storage.mjs'
import { AgenteMesora } from './worker.mjs'

const comando = process.argv[2]

async function main() {
  if (comando === 'estado') {
    const estado = await almacenAgente.leerEstado()
    if (!estado) { console.log('El agente todavía no se ha iniciado.'); return }
    let activo = false
    if (estado.pid) { try { process.kill(estado.pid, 0); activo = true } catch { /* proceso cerrado */ } }
    console.log(`${activo ? 'Proceso activo' : 'Proceso detenido'} · ${estado.estado} · ${estado.actualizado_at}`)
    if (estado.detalle) console.log(estado.detalle)
    return
  }
  if (process.platform !== 'win32') throw new Error('El agente de impresión se ejecuta en Windows.')
  if (comando === 'vincular') {
    const url = process.env.MESORA_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const apiKey = process.env.MESORA_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const transporte = crearTransporte({ url, apiKey })
    const lector = createInterface({ input: entrada, output: salida })
    try {
      const nombre = (await lector.question('Nombre de esta computadora: ')).trim()
      const codigo = (await lector.question('Código temporal del panel Mesora: ')).trim().toLowerCase()
      const token = randomBytes(32).toString('hex')
      const vinculo = await transporte.rpc('agente_impresion_vincular', {
        p_codigo: codigo, p_token: token, p_nombre: nombre,
      })
      await almacenAgente.guardarVinculo({ url, apiKey, token, agente_id: vinculo.agente_id,
        restaurante_id: vinculo.restaurante_id })
      console.log('Agente vinculado. El token quedó cifrado para este usuario de Windows.')
    } finally { lector.close() }
    return
  }
  if (comando === 'iniciar') {
    const vinculo = await almacenAgente.leerVinculo()
    const transporte = crearTransporte({ url: vinculo.url, apiKey: vinculo.apiKey })
    const controlador = new AbortController()
    process.once('SIGINT', () => controlador.abort())
    process.once('SIGTERM', () => controlador.abort())
    const agente = new AgenteMesora({ transporte, impresora: new ImpresoraWindows(),
      almacen: almacenAgente, token: vinculo.token,
      informar: (estado) => console.log(`[${new Date().toLocaleString('es-PE')}] ${estado.estado}: ${estado.detalle}`),
    })
    await agente.ejecutar({ signal: controlador.signal })
    return
  }
  console.log('Uso: npm run agente:vincular | npm run agente:iniciar | npm run agente:estado')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
