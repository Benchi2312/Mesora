import { useEffect, useState } from 'react'
import {
  subirImagenProducto,
  validarArchivoImagenProducto,
} from '../../lib/imagenesProducto'

type Props = {
  restauranteId: string
  isDemo: boolean
  imagenUrl: string
  imagenPublicId: string | null
  imagenUrlOriginal: string
  imagenPublicIdOriginal: string | null
  deshabilitado?: boolean
  onChange: (url: string, publicId: string | null) => void
  onSubidaConfirmada: (publicId: string) => void
  onEstadoCarga: (cargando: boolean) => void
}

export default function ImagenProductoEditor({
  restauranteId,
  isDemo,
  imagenUrl,
  imagenPublicId,
  imagenUrlOriginal,
  imagenPublicIdOriginal,
  deshabilitado = false,
  onChange,
  onSubidaConfirmada,
  onEstadoCarga,
}: Props) {
  const [modo, setModo] = useState<'enlace' | 'archivo'>(imagenPublicId ? 'archivo' : 'enlace')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [vistaPreviaLocal, setVistaPreviaLocal] = useState<string | null>(null)

  useEffect(() => {
    if (!archivo || validarArchivoImagenProducto(archivo)) {
      setVistaPreviaLocal(null)
      return
    }
    const url = URL.createObjectURL(archivo)
    setVistaPreviaLocal(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  function cambiarEnlace(url: string) {
    const id = url === imagenUrl
      ? imagenPublicId
      : url === imagenUrlOriginal
        ? imagenPublicIdOriginal
        : null
    onChange(url, id)
    setMensaje(null)
    setError(null)
  }

  async function subir() {
    if (!archivo || cargando) return
    const validacion = validarArchivoImagenProducto(archivo)
    if (validacion) {
      setError(validacion)
      return
    }
    setCargando(true)
    onEstadoCarga(true)
    setError(null)
    setMensaje(null)
    setProgreso(0)
    try {
      const imagen = await subirImagenProducto(archivo, restauranteId, setProgreso)
      onChange(imagen.secure_url, imagen.public_id)
      onSubidaConfirmada(imagen.public_id)
      setArchivo(null)
      setMensaje('Imagen cargada. Se guardará junto con el producto al confirmar el formulario.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo subir la imagen. Puedes reintentar.')
    } finally {
      setCargando(false)
      onEstadoCarga(false)
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-surface-700 bg-surface-900/50 p-3 sm:p-4" aria-label="Imagen del producto">
      <h4 className="mb-2 text-sm font-bold text-zinc-200">Imagen del producto</h4>
      <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Forma de agregar imagen">
        <button
          type="button"
          aria-pressed={modo === 'enlace'}
          disabled={deshabilitado || cargando}
          onClick={() => setModo('enlace')}
          className={`btn min-h-11 px-3 ${modo === 'enlace' ? 'btn-primary' : 'btn-outline'}`}
        >Usar enlace</button>
        <button
          type="button"
          aria-pressed={modo === 'archivo'}
          disabled={deshabilitado || cargando}
          onClick={() => setModo('archivo')}
          className={`btn min-h-11 px-3 ${modo === 'archivo' ? 'btn-primary' : 'btn-outline'}`}
        >Subir archivo</button>
      </div>

      {modo === 'enlace' ? (
        <label className="block">
          <span className="label">Enlace HTTPS (opcional)</span>
          <input
            id="producto-imagen"
            type="url"
            inputMode="url"
            value={imagenUrl}
            disabled={deshabilitado || cargando}
            onChange={(event) => cambiarEnlace(event.target.value)}
            className="input min-h-11"
            placeholder="https://ejemplo.com/imagen.jpg"
            autoComplete="url"
          />
        </label>
      ) : (
        <div>
          <label className="label" htmlFor="producto-imagen-archivo">Archivo de imagen</label>
          <input
            id="producto-imagen-archivo"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={deshabilitado || cargando || isDemo}
            onChange={(event) => {
              const seleccionado = event.currentTarget.files?.[0] ?? null
              setArchivo(seleccionado)
              event.currentTarget.value = ''
              setError(seleccionado ? validarArchivoImagenProducto(seleccionado) : null)
              setMensaje(null)
            }}
            className="input min-h-11 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-700 file:px-3 file:py-1.5 file:font-semibold file:text-zinc-100"
          />
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">JPG, PNG o WebP. Máximo 5 MB. La carga se guarda en Cloudinary.</p>
          {isDemo && <p className="mt-2 text-sm text-amber-300">La carga de archivos no está disponible en el demo. Puedes probarla desde un restaurante real autorizado.</p>}
          {archivo && !error && <p className="mt-2 truncate text-xs text-zinc-400">Seleccionado: {archivo.name}</p>}
          <button
            type="button"
            onClick={() => void subir()}
            disabled={deshabilitado || isDemo || cargando || !archivo || Boolean(error)}
            className="btn btn-outline mt-3 min-h-11 px-4"
          >{cargando ? 'Subiendo imagen…' : imagenUrl ? 'Reemplazar imagen' : 'Subir imagen'}</button>
          {cargando && (
            <div className="mt-3" role="progressbar" aria-label="Progreso de carga" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progreso}>
              <div className="h-2 overflow-hidden rounded-full bg-surface-700">
                <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${progreso}%` }} />
              </div>
              <p className="mt-1 text-xs text-zinc-400">{progreso}%</p>
            </div>
          )}
        </div>
      )}

      {(vistaPreviaLocal || imagenUrl) && (
        <div className="mt-3 flex items-start gap-3 rounded-lg border border-surface-700 p-2.5">
          <img src={vistaPreviaLocal ?? imagenUrl} alt="Vista previa del producto" className="h-20 w-20 shrink-0 rounded-lg bg-surface-800 object-cover" loading="lazy" referrerPolicy="no-referrer" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-300">{vistaPreviaLocal ? 'Vista previa del archivo seleccionado' : 'Vista previa actual'}</p>
            {vistaPreviaLocal && <p className="mt-1 text-xs text-zinc-500">El enlace permanente se generará al subirlo.</p>}
            <button
              type="button"
              disabled={deshabilitado || cargando}
              onClick={() => {
                if (vistaPreviaLocal) {
                  setArchivo(null)
                  setMensaje('Se descartó el archivo seleccionado; la imagen guardada se conserva.')
                } else {
                  onChange('', null)
                  setArchivo(null)
                  setMensaje('La imagen se quitará del producto al guardar los cambios.')
                }
                setError(null)
              }}
              className="btn btn-outline mt-2 min-h-11 px-3"
            >{vistaPreviaLocal ? 'Descartar archivo' : 'Quitar imagen'}</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-danger-500">{error}</p>}
      {mensaje && <p role="status" className="mt-2 text-sm text-emerald-400">{mensaje}</p>}
      {modo === 'archivo' && !isDemo && <p className="mt-2 text-xs leading-relaxed text-zinc-500">La imagen reemplazada se conserva hasta que se guarde el producto.</p>}
    </section>
  )
}
