import { useCallback, useEffect, useState } from 'react'
import { getApi } from '../../lib/api'
import type { ConfiguracionGlobal } from '../../types/database'
import { fmtFecha } from '../../lib/format'
import type { DatosConfiguracionGlobal } from '../../domain/restaurant/configuracion'
import SuperAdminCarga from './SuperAdminCarga'
import { Campo } from '../../components/ui'

export default function SuperAdminConfiguracion() {
  const [config, setConfig] = useState<ConfiguracionGlobal | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<DatosConfiguracionGlobal>({
    nombre_app: '',
    correo_soporte: '',
    telefono_soporte: '',
    logo_url: '',
    informacion: '',
    precio_plan_mensual: 120,
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const res = await getApi().getConfiguracionGlobal()
    if (res.error) {
      setError(res.error)
      setConfig(null)
      return
    }
    setConfig(res.data)
    setForm({
      nombre_app: res.data?.nombre_app ?? 'Mesora',
      correo_soporte: res.data?.correo_soporte ?? '',
      telefono_soporte: res.data?.telefono_soporte ?? '',
      logo_url: res.data?.logo_url ?? '',
      informacion: res.data?.informacion ?? '',
      precio_plan_mensual: res.data?.precio_plan_mensual ?? 120,
    })
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [cargar])

  async function guardar() {
    setEnviando(true)
    setFormError(null)
    setAviso(null)
    const res = await getApi().actualizarConfiguracionGlobal(form)
    setEnviando(false)
    if (res.error) {
      setFormError(res.error)
      return
    }
    setConfig(res.data)
    setAviso('Configuración guardada. Los cambios ya están vigentes.')
  }

  if (cargando) return <SuperAdminCarga recurso="la configuración" />

  if (error)
    return (
      <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudo cargar la configuración. {error}
      </div>
    )

  return (
    <div>
      {aviso && <div className="aviso mb-5 border-ok-500/30 bg-ok-500/10 text-ok-500">{aviso}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
        className="card max-w-2xl p-5 sm:p-6"
      >
        <p className="mb-5 text-sm text-zinc-500">
          Ajustes generales de la plataforma. El correo y el teléfono se muestran como contacto
          público en la landing; el precio mensual del plan también aparece allí. Solo el super
          administrador puede editarlos y cada cambio queda auditado.
        </p>

        <Campo etiqueta="Nombre de la aplicación" htmlFor="cfg-nombre" error={null}>
          <input
            id="cfg-nombre"
            className="input"
            required
            maxLength={60}
            value={form.nombre_app}
            onChange={(e) => setForm((f) => ({ ...f, nombre_app: e.target.value }))}
          />
        </Campo>

        <Campo etiqueta="Correo público de contacto" htmlFor="cfg-correo" error={null}>
          <input
            id="cfg-correo"
            type="email"
            className="input"
            maxLength={160}
            placeholder="mesoratech@gmail.com"
            value={form.correo_soporte ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, correo_soporte: e.target.value }))}
          />
        </Campo>

        <Campo etiqueta="Teléfono público de contacto" htmlFor="cfg-telefono" error={null}>
          <input
            id="cfg-telefono"
            type="tel"
            className="input"
            maxLength={40}
            value={form.telefono_soporte ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, telefono_soporte: e.target.value }))}
          />
        </Campo>

        <Campo etiqueta="URL del logo" htmlFor="cfg-logo" error={null}>
          <input
            id="cfg-logo"
            type="url"
            className="input"
            maxLength={400}
            placeholder="https://…"
            value={form.logo_url ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
          />
        </Campo>

        <Campo etiqueta="Información general" htmlFor="cfg-info" error={null}>
          <textarea
            id="cfg-info"
            className="input min-h-28"
            maxLength={2000}
            value={form.informacion ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, informacion: e.target.value }))}
          />
        </Campo>

        <Campo etiqueta="Precio mensual del plan (S/)" htmlFor="cfg-precio" error={null}>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">S/</span>
            <input
              id="cfg-precio"
              type="number"
              min="0"
              step="0.01"
              className="input max-w-40"
              value={form.precio_plan_mensual ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, precio_plan_mensual: e.target.value === '' ? null : Number(e.target.value) }))
              }
            />
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">
            Es el precio del plan único «Mesora Pro» por mes. La landing lo muestra en público.
          </p>
        </Campo>

        {formError && (
          <div className="aviso mt-2 border-danger-500/40 bg-danger-500/10 text-danger-500">
            {formError}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Última actualización: {fmtFecha(config?.updated_at)}
          </p>
          <button
            type="submit"
            disabled={enviando}
            className="btn btn-primary min-h-11 px-5"
          >
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
