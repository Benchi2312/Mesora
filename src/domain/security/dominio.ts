// Identidad por dominio: el admin de un restaurante define un dominio propio
// (ej. litoral.pe) y su personal entra como usuario@dominio (carlos@litoral.pe,
// cocina@litoral.pe). Es lógica pura, compartida por el panel de personal
// (PersonalTab) y la configuración del local (ConfiguracionTab).

/**
 * Normaliza un dominio escrito por el admin: sin espacios, minúsculas, sin `@`
 * inicial, sin `www.` ni barra final. Devuelve '' si no queda nada.
 */
export function normalizarDominio(valor: string | null | undefined): string {
  if (!valor) return ''
  return valor
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

/**
 * ¿Tiene forma de dominio? Etiquetas alfanuméricas (con guiones internos)
 * separadas por puntos, al menos dos etiquetas y TLD de 2+ letras.
 */
export function esDominioValido(valor: string | null | undefined): boolean {
  const d = normalizarDominio(valor)
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d)
}

/**
 * Parte local de un correo: letras, dígitos y `. _ -`, sin espacios ni `@`. Es
 * el `carlos` de `carlos@litoral.pe`.
 */
export function esUsuarioValido(valor: string): boolean {
  return /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i.test(valor.trim())
}

/**
 * Arma `usuario@dominio`. Sin dominio devuelve el texto tal cual (así el campo
 * puede seguir guardando un correo completo cuando el local no definió dominio).
 */
export function construirEmail(usuario: string, dominio: string | null | undefined): string {
  const u = usuario.trim().toLowerCase()
  const d = normalizarDominio(dominio)
  if (!u) return ''
  return d ? `${u}@${d}` : u
}

/**
 * Separa un correo ya guardado en su parte local, usando el dominio del local.
 * Si el correo no pertenece a ese dominio, se devuelve completo como "usuario"
 * para no perder información al editar.
 */
export function separarEmail(
  email: string | null | undefined,
  dominio: string | null | undefined,
): string {
  const correo = (email ?? '').trim().toLowerCase()
  if (!correo) return ''
  const d = normalizarDominio(dominio)
  if (!d) return correo
  const arroba = correo.lastIndexOf('@')
  if (arroba === -1) return correo
  return correo.slice(arroba + 1) === d ? correo.slice(0, arroba) : correo
}
