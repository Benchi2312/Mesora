export type ParametrosFirmadosCloudinary = Record<string, string>

export function parametrosCargaCloudinary(
  carpetaActivos: string,
  publicId: string,
  timestamp: string,
): ParametrosFirmadosCloudinary {
  return {
    asset_folder: carpetaActivos,
    public_id: publicId,
    timestamp,
  }
}

export function cadenaFirmaCloudinary(parametros: ParametrosFirmadosCloudinary): string {
  return Object.keys(parametros)
    .sort()
    .map((clave) => `${clave}=${parametros[clave]}`)
    .join('&')
}

export async function firmarParametrosCloudinary(
  parametros: ParametrosFirmadosCloudinary,
  apiSecret: string,
): Promise<string> {
  const texto = cadenaFirmaCloudinary(parametros) + apiSecret
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function formularioCargaCloudinary(
  archivo: File,
  apiKey: string,
  parametros: ParametrosFirmadosCloudinary,
  firma: string,
): FormData {
  const body = new FormData()
  body.set('file', archivo, archivo.name)
  body.set('api_key', apiKey)
  for (const [clave, valor] of Object.entries(parametros)) body.set(clave, valor)
  body.set('signature', firma)
  return body
}
