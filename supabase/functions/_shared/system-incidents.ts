export type IncidentSource = 'contacto-comercial' | 'admin-password-recovery' | 'crear-restaurante'

// Solo se registran códigos fijos; nunca correos, tokens, contraseñas ni errores
// de proveedores. El mensaje estructurado también queda en los logs de Edge.
export async function recordSystemIncident(source: IncidentSource, code: string): Promise<void> {
  console.error(`[mesora:incident] ${source}:${code}`)
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return
  try {
    const response = await fetch(`${url}/rest/v1/rpc/mesora_record_incident`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_source: source, p_code: code }),
    })
    await response.body?.cancel()
    if (!response.ok) console.error(`[mesora:incident-store] ${source}:${code}:http_${response.status}`)
  } catch {
    console.error(`[mesora:incident-store] ${source}:${code}:unavailable`)
  }
}
