import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { esErrorDeCargaDeChunk, limpiarMarcaDeReintento } from '../lib/chunkRecovery'

function detalleDelError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    if (typeof error.data === 'string') return error.data
    if (error.data && typeof error.data === 'object' && 'message' in error.data) {
      return String(error.data.message)
    }
    return `${error.status} ${error.statusText}`.trim()
  }
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Error inesperado al cargar la sección.'
}

export default function RouteErrorPage() {
  const error = useRouteError()
  const falloChunk = esErrorDeCargaDeChunk(error)
  const respuesta = isRouteErrorResponse(error) ? error : null

  let titulo = 'No se pudo cargar esta sección'
  let mensaje = 'Intenta recargar la página. Si el problema continúa, vuelve al inicio o contacta al soporte de Mesora.'
  if (falloChunk) {
    titulo = 'No pudimos actualizar esta pantalla'
    mensaje = 'La página seguía abierta durante una actualización y no se pudo cargar un recurso. Recarga para obtener la versión actual.'
  } else if (respuesta?.status === 401) {
    titulo = 'Tu sesión necesita actualizarse'
    mensaje = 'Vuelve a iniciar sesión para continuar.'
  } else if (respuesta?.status === 403) {
    titulo = 'No tienes permiso para ver esta sección'
    mensaje = 'Si consideras que deberías tener acceso, consulta con el administrador de tu restaurante.'
  } else if (respuesta?.status === 404) {
    titulo = 'No encontramos esta sección'
    mensaje = 'Comprueba la dirección o vuelve al inicio.'
  } else if (respuesta && respuesta.status >= 500) {
    titulo = 'El servicio no pudo completar la solicitud'
    mensaje = 'Vuelve a intentarlo en unos momentos. Si el problema persiste, contacta al soporte de Mesora.'
  }

  const detalle = detalleDelError(error)
  const mostrarDetalle = !falloChunk && detalle.length > 0

  return (
    <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-950 px-4 py-10 text-center text-zinc-100">
      <div className="w-full max-w-lg rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-xl sm:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-400">Mesora</p>
        <h1 className="mt-3 text-2xl font-bold">{titulo}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{mensaje}</p>
        {mostrarDetalle && (
          <details className="mt-5 text-left text-xs text-zinc-500">
            <summary className="cursor-pointer rounded-lg py-2 font-semibold text-zinc-400">Ver detalle para soporte</summary>
            <p className="mt-2 break-words rounded-lg bg-surface-950 p-3">{detalle}</p>
          </details>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              limpiarMarcaDeReintento()
              window.location.reload()
            }}
            className="btn btn-primary min-h-11 px-5"
          >
            Recargar página
          </button>
          <Link to={respuesta?.status === 401 ? '/login' : '/'} className="btn btn-outline min-h-11 px-5">
            {respuesta?.status === 401 ? 'Iniciar sesión' : 'Volver al inicio'}
          </Link>
        </div>
      </div>
    </main>
  )
}
