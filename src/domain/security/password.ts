// Contraseña temporal para el restablecimiento administrativo.
//
// El Admin del restaurante le genera al trabajador una contraseña que existe
// solo en el momento: se la entrega en persona y el trabajador la cambia al
// entrar.
//
// Esta función es el espejo de `generarPasswordTemporal` en la Edge Function
// `reset-password-personal` (supabase/functions/reset-password-personal/index.ts).
// Deno no puede importar este archivo, así que la lógica está duplicada a
// propósito: los dos lados tienen que producir el MISMO tipo de clave
// (12 caracteres, base64url, nada de palabras del diccionario).

/**
 * Genera una contraseña temporal de `longitud` caracteres.
 *
 * Bytes aleatorios de `crypto.getRandomValues` codificados en base64url (los
 * dos caracteres del base64 estándar que no son URL-safe se sustituyen) y
 * recortados a la longitud pedida.
 */
export function generarPasswordTemporal(longitud = 12): string {
  // 3 bytes dan 4 caracteres base64: se piden de más y se recorta.
  const bytes = new Uint8Array(Math.ceil((longitud * 4) / 3) + 3)
  crypto.getRandomValues(bytes)
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  const base64url = btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return base64url.slice(0, longitud)
}
