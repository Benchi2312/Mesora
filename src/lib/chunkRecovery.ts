const PARAMETRO_REINTENTO = '__mesora_chunk_retry'

let recargaSolicitada = false

/**
 * Vite notifica aquí los fallos al cargar imports dinámicos. Una pestaña vieja
 * puede apuntar a chunks que Vercel retiró tras una publicación nueva.
 */
export function iniciarRecuperacionDeChunks() {
  window.addEventListener('vite:preloadError', () => {
    const url = new URL(window.location.href)

    // La marca viaja en la URL para sobrevivir a la recarga, incluso si el
    // almacenamiento del navegador está deshabilitado.
    if (recargaSolicitada || url.searchParams.get(PARAMETRO_REINTENTO) === '1') return

    recargaSolicitada = true
    url.searchParams.set(PARAMETRO_REINTENTO, '1')
    window.location.replace(url.toString())
  })
}

/** Quita la marca únicamente después de confirmar que un chunk sí cargó. */
export function confirmarCargaDeChunk() {
  const url = new URL(window.location.href)
  if (url.searchParams.get(PARAMETRO_REINTENTO) !== '1') return

  url.searchParams.delete(PARAMETRO_REINTENTO)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

/** Permite un nuevo intento cuando la persona lo solicita manualmente. */
export function limpiarMarcaDeReintento() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(PARAMETRO_REINTENTO)) return

  url.searchParams.delete(PARAMETRO_REINTENTO)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export function esErrorDeCargaDeChunk(error: unknown): boolean {
  const mensaje = error instanceof Error ? error.message : String(error ?? '')
  return /failed to fetch dynamically imported module|importing a module script failed|failed to load module script|loading chunk .* failed|chunkloaderror/i.test(mensaje)
}
