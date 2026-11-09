import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./windows-print.ps1', import.meta.url))
const powershellExe = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function powershell(modo, entrada = '') {
  if (process.platform !== 'win32') throw new Error('El adaptador real requiere Windows.')
  return new Promise((resolve, reject) => {
    const hijo = spawn(powershellExe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Modo', modo],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let salida = ''; let error = ''
    hijo.stdout.setEncoding('utf8'); hijo.stderr.setEncoding('utf8')
    hijo.stdout.on('data', (parte) => { salida += parte })
    hijo.stderr.on('data', (parte) => { error += parte })
    hijo.on('error', () => reject(new Error('No se pudo iniciar PowerShell para imprimir.')))
    hijo.on('close', (codigo) => codigo === 0 ? resolve(salida.trim()) : reject(new Error(error.trim().slice(0, 300) || 'Windows no aceptó el trabajo de impresión.')))
    hijo.stdin.end(entrada, 'utf8')
  })
}

export class ImpresoraWindows {
  async listar() {
    const salida = await powershell('listar')
    if (!salida) return []
    const lista = JSON.parse(salida)
    return Array.isArray(lista) ? lista : [lista]
  }

  async imprimir(trabajo) {
    const resultado = await powershell('imprimir', JSON.stringify(trabajo))
    if (resultado !== 'ENVIADO_A_COLA') throw new Error('Windows no confirmó el envío a la cola.')
    return { enviadoACola: true, impresionFisicaConfirmada: false }
  }
}
