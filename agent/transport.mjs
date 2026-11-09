const RPCS = new Set([
  'agente_impresion_vincular', 'agente_impresion_heartbeat',
  'agente_impresion_reclamar', 'agente_impresion_iniciar_envio',
  'agente_impresion_confirmar', 'agente_impresion_fallar',
])
const HOST_MESORA = 'yyfsewgxyyqjyzcejsqq.supabase.co'

export function validarConexion(url, apiKey, { permitirLocal = false } = {}) {
  const destino = new URL(url)
  const local = permitirLocal && ['127.0.0.1', 'localhost'].includes(destino.hostname)
  if (!local && (destino.protocol !== 'https:' || destino.hostname !== HOST_MESORA || destino.port)) {
    throw new Error('Configura la URL HTTPS del proyecto Supabase autorizado de Mesora.')
  }
  if (destino.username || destino.password || destino.search || destino.hash || destino.pathname !== '/') {
    throw new Error('La URL de Supabase debe ser la raíz del proyecto.')
  }
  if (!apiKey || apiKey.startsWith('sb_secret_') || apiKey.startsWith('sb_service_')) {
    throw new Error('El agente solo admite una clave pública de Supabase.')
  }
  if (apiKey.startsWith('eyJ')) {
    try {
      const jwt = JSON.parse(Buffer.from(apiKey.split('.')[1], 'base64url').toString('utf8'))
      if (jwt.role !== 'anon') throw new Error('No es una clave pública.')
    } catch { throw new Error('El agente solo admite la clave anon pública de Supabase.') }
  } else if (!apiKey.startsWith('sb_publishable_')) {
    throw new Error('El agente solo admite la clave pública de Supabase.')
  }
  return destino.origin
}

export function crearTransporte({ url, apiKey, fetchImpl = fetch, permitirLocal = false }) {
  const origin = validarConexion(url, apiKey, { permitirLocal })
  return {
    async rpc(nombre, parametros, { timeoutMs = 15000 } = {}) {
      if (!RPCS.has(nombre)) throw new Error('Operación de agente no permitida.')
      let respuesta
      try {
        respuesta = await fetchImpl(`${origin}/rest/v1/rpc/${nombre}`, {
          method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/json', apikey: apiKey,
            ...(apiKey.startsWith('eyJ') ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify(parametros), signal: AbortSignal.timeout(timeoutMs),
        })
      } catch { throw new Error('No se pudo conectar con Mesora. Comprueba Internet y vuelve a intentar.') }
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(String(cuerpo.message || 'Mesora rechazó la operación del agente.').slice(0, 300))
      }
      return respuesta.status === 204 ? null : respuesta.json()
    },
  }
}
