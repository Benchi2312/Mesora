import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dpapiScript = fileURLToPath(new URL('./windows-dpapi.ps1', import.meta.url))
const powershellExe = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function directorioBase() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) {
    throw new Error('El almacén cifrado del agente requiere una cuenta de usuario de Windows.')
  }
  return join(process.env.LOCALAPPDATA, 'Mesora', 'print-agent')
}

function dpapi(modo, texto) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(powershellExe, ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
      '-File',dpapiScript,'-Modo',modo], { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    let salida = ''
    hijo.stdout.setEncoding('utf8')
    hijo.stdout.on('data', (parte) => { salida += parte })
    hijo.on('error', () => reject(new Error('Windows no pudo abrir el almacén cifrado.')))
    hijo.on('close', (codigo) => codigo === 0 ? resolve(salida) : reject(new Error('Windows no pudo abrir el almacén cifrado.')))
    hijo.stdin.end(texto, 'utf8')
  })
}

async function guardarCifrado(nombre, valor) {
  const dir = directorioBase()
  await mkdir(dir, { recursive: true })
  const cifrado = await dpapi('proteger', JSON.stringify(valor))
  const destino = join(dir, nombre)
  const temporal = `${destino}.${process.pid}.tmp`
  await writeFile(temporal, cifrado, { encoding: 'utf8', mode: 0o600 })
  await rename(temporal, destino)
}

async function leerCifrado(nombre) {
  const cifrado = await readFile(join(directorioBase(), nombre), 'utf8')
  return JSON.parse(await dpapi('abrir', cifrado))
}

export const almacenAgente = {
  guardarVinculo: (valor) => guardarCifrado('vinculo.dpapi', valor),
  leerVinculo: () => leerCifrado('vinculo.dpapi'),
  guardarRecibo: (valor) => guardarCifrado('recibo.dpapi', valor),
  leerRecibo: async () => {
    try { return await leerCifrado('recibo.dpapi') }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
  },
  borrarRecibo: async () => { await unlink(join(directorioBase(), 'recibo.dpapi')).catch((e) => { if (e.code !== 'ENOENT') throw e }) },
  guardarEstado: async (estado) => {
    const dir = directorioBase()
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'estado.json'), JSON.stringify({ ...estado, actualizado_at: new Date().toISOString() }, null, 2), 'utf8')
  },
  leerEstado: async () => {
    try { return JSON.parse(await readFile(join(directorioBase(), 'estado.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
  },
}
