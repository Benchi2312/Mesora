import { useCallback, useEffect, useState } from 'react'
import { getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { useAuthStore } from '../../store/auth'
import { useDemoStore } from '../../demo/demoStore'
import { Campo, IconoInfo } from '../../components/ui'
import { PIN_MAX_DIGITOS, PIN_MIN_DIGITOS, errorAlConfigurarPin } from '../../domain/security/autorizacion'
import { esDominioValido, normalizarDominio } from '../../domain/security/dominio'
import { olvidarPinCacheado } from '../../components/pin'

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RUC_OK = /^\d{11}$/
const TELEFONO_OK = /^[+()\d\s.-]{6,20}$/

type Formulario = {
  nombre: string
  ruc: string
  direccion: string
  telefono: string
  email_contacto: string
  dominio: string
}

/**
 * Datos del local. Todo lo de acá sale impreso en la boleta, así que antes
 * eran placeholders hardcodeados en `CerrarCuenta.tsx`.
 */
export default function ConfiguracionTab() {
  const { restaurante } = useCurrentContext()
  const esDemo = useDemoStore((s) => s.isDemo)
  const rid = restaurante?.id

  const [form, setForm] = useState<Formulario>({
    nombre: '',
    ruc: '',
    direccion: '',
    telefono: '',
    email_contacto: '',
    dominio: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [hayPin, setHayPin] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [pinRepetido, setPinRepetido] = useState('')
  const [errorPin, setErrorPin] = useState<string | null>(null)
  const [okPin, setOkPin] = useState<string | null>(null)
  const [guardandoPin, setGuardandoPin] = useState(false)

  useEffect(() => {
    if (!restaurante) return
    setForm({
      nombre: restaurante.nombre ?? '',
      ruc: restaurante.ruc ?? '',
      direccion: restaurante.direccion ?? '',
      telefono: restaurante.telefono ?? '',
      email_contacto: restaurante.email_contacto ?? '',
      dominio: restaurante.dominio ?? '',
    })
  }, [restaurante])

  // ¿Hay PIN? Solo un booleano: el hash se queda en el servidor y ni el Admin
  // puede leerlo (ver supabase/pin_autorizacion.sql).
  const cargarPin = useCallback(async () => {
    if (!rid) return
    const { data, error: apiErr } = await getApi().tienePinAutorizacion(rid)
    setHayPin(apiErr ? null : data)
  }, [rid])

  useEffect(() => {
    void cargarPin()
  }, [cargarPin])

  if (!restaurante) return null

  function set<K extends keyof Formulario>(campo: K, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
    setOk(null)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!rid) return
    setError(null)
    setOk(null)

    const nombre = form.nombre.trim()
    const ruc = form.ruc.trim()
    const email = form.email_contacto.trim()
    const telefono = form.telefono.trim()
    const dominio = normalizarDominio(form.dominio)

    if (!nombre) return setError('El nombre del restaurante es obligatorio.')
    if (ruc !== '' && !RUC_OK.test(ruc)) return setError('El RUC debe tener 11 dígitos (ej. 20123456789).')
    if (email !== '' && !EMAIL_OK.test(email)) return setError('Ingresa un correo válido (ej. contacto@correo.com).')
    if (telefono !== '' && !TELEFONO_OK.test(telefono)) return setError('Ingresa un teléfono válido.')
    if (dominio !== '' && !esDominioValido(dominio)) return setError('Ingresa un dominio válido (ej. litoral.pe).')

    setGuardando(true)
    try {
      const res = await getApi().actualizarRestaurante(rid, {
        nombre,
        ruc: ruc || null,
        direccion: form.direccion.trim() || null,
        telefono: telefono || null,
        email_contacto: email || null,
        dominio: dominio || null,
      })
      if (res.error || !res.data) {
        setError(res.error ?? 'El servidor no confirmó los datos guardados. Actualiza antes de reintentar.')
        return
      }
      // La fila devuelta por el servidor actualiza el contexto de recibos y personal.
      if (esDemo) useDemoStore.getState().actualizarRestaurante(res.data)
      else if (useAuthStore.getState().restaurante?.id === rid) useAuthStore.setState({ restaurante: res.data })
      setOk('Datos guardados. La próxima precuenta y boleta usarán estos datos.')
    } catch {
      setError('No se pudo confirmar el guardado. Revisa tu conexión y actualiza antes de reintentar.')
    } finally {
      setGuardando(false)
    }
  }

  async function guardarPin(e: React.FormEvent) {
    e.preventDefault()
    if (!rid) return
    setErrorPin(null)
    setOkPin(null)
    const errorLocal = errorAlConfigurarPin(pin, pinRepetido)
    if (errorLocal) return setErrorPin(errorLocal)

    setGuardandoPin(true)
    const res = await getApi().configurarPinAutorizacion(rid, pin)
    setGuardandoPin(false)
    if (res.error) return setErrorPin(res.error)
    // El valor no se vuelve a pedir ni se guarda en el navegador: se limpia de
    // inmediato para que no quede a la vista detrás del formulario.
    setPin('')
    setPinRepetido('')
    olvidarPinCacheado()
    await cargarPin()
    setOkPin('PIN guardado. A partir de ahora, anular un ítem o un cobro lo pide.')
  }

  async function quitarPin() {
    if (!rid) return
    setErrorPin(null)
    setOkPin(null)
    setGuardandoPin(true)
    const res = await getApi().quitarPinAutorizacion(rid)
    setGuardandoPin(false)
    if (res.error) return setErrorPin(res.error)
    olvidarPinCacheado()
    await cargarPin()
    setOkPin('PIN eliminado. Cualquiera del restaurante puede anular ítems y cobros.')
  }

  const campos: Array<[keyof Formulario, string]> = [
    ['nombre', restaurante.nombre ?? ''],
    ['ruc', restaurante.ruc ?? ''],
    ['direccion', restaurante.direccion ?? ''],
    ['telefono', restaurante.telefono ?? ''],
    ['email_contacto', restaurante.email_contacto ?? ''],
    ['dominio', restaurante.dominio ?? ''],
  ]
  const hayCambios = campos.some(([campo, original]) => String(form[campo]).trim() !== original)

  return (
    <div>
      <div className="aviso mb-5 border-brand-500/30 bg-brand-500/10 text-brand-300">
        <span className="flex items-start gap-2.5">
          <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Estos datos salen impresos en cada boleta. Si no los completas, la boleta se emite sin RUC ni
            dirección fiscal.
          </span>
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void guardar(e)
        }}
      >
        <div className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">Datos del local</h2>
          <p className="mt-0.5 mb-5 text-sm text-zinc-500">Nombre y datos fiscales que salen en la boleta.</p>

          <Campo etiqueta="Nombre del restaurante" htmlFor="cfg-nombre">
            <input
              id="cfg-nombre"
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              className="input"
              placeholder="Ej. restaurante La Esquina"
              required
            />
          </Campo>

          <Campo etiqueta="RUC" htmlFor="cfg-ruc">
            <input
              id="cfg-ruc"
              inputMode="numeric"
              value={form.ruc}
              onChange={(e) => set('ruc', e.target.value.replace(/\D/g, '').slice(0, 11))}
              className="input"
              placeholder="20123456789"
            />
          </Campo>

          <Campo etiqueta="Dirección" htmlFor="cfg-direccion">
            <input
              id="cfg-direccion"
              value={form.direccion}
              onChange={(e) => set('direccion', e.target.value)}
              className="input"
              placeholder="Av. Ejemplo 123 - Miraflores"
            />
          </Campo>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Campo etiqueta="Teléfono" htmlFor="cfg-telefono">
              <input
                id="cfg-telefono"
                inputMode="tel"
                value={form.telefono}
                onChange={(e) => set('telefono', e.target.value)}
                className="input"
                placeholder="+51 999 999 999"
              />
            </Campo>

            <Campo etiqueta="Correo de contacto" htmlFor="cfg-email">
              <input
                id="cfg-email"
                type="email"
                inputMode="email"
                value={form.email_contacto}
                onChange={(e) => set('email_contacto', e.target.value)}
                className="input"
                placeholder="contacto@correo.com"
              />
            </Campo>
          </div>

          <Campo etiqueta="Dominio de correos del personal" htmlFor="cfg-dominio">
            <div className="flex items-stretch">
              <span className="grid place-items-center rounded-l-xl border border-r-0 border-surface-700 bg-surface-800 px-3 text-sm text-zinc-400">
                @
              </span>
              <input
                id="cfg-dominio"
                value={form.dominio}
                onChange={(e) => set('dominio', e.target.value)}
                className="input rounded-l-none"
                placeholder="litoral.pe"
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Opcional. Si lo defines, tu personal entra como usuario@dominio (ej. carlos@litoral.pe).
            </p>
          </Campo>

          {error && (
            <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{error}</div>
          )}
          {ok && <div className="aviso mb-4 border-ok-500/40 bg-ok-500/10 text-ok-500">{ok}</div>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {esDemo && (
              <p className="mr-auto text-xs text-zinc-500">Modo demo: los cambios se guardan solo en este navegador.</p>
            )}
            <button type="submit" disabled={guardando || !hayCambios} className="btn btn-primary min-h-11 px-5">
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>

      <div className="card mt-5 p-4 sm:p-5">
        <h2 className="text-lg font-bold tracking-tight text-zinc-100">PIN de autorización</h2>
        <p className="mt-0.5 mb-5 text-sm text-zinc-500">
          {hayPin
            ? 'Ya hay un PIN configurado. Nadie puede verlo, ni siquiera tú: solo se puede cambiar.'
            : 'Sin PIN, cualquiera del restaurante puede anular ítems y cobros. Configúralo para que haga falta la autorización de alguien.'}
        </p>

        <div className="aviso mb-5 border-brand-500/30 bg-brand-500/10 text-brand-300">
          <span className="flex items-start gap-2.5">
            <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Con PIN, anular un ítem o un cobro pide el número: el mesero se lo pide a quien autoriza, y el
              administrador o el cajero también lo necesitan. Se guarda cifrado y no se vuelve a mostrar.
            </span>
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void guardarPin(e)
          }}
        >
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Campo etiqueta={hayPin ? 'Nuevo PIN' : 'PIN'} htmlFor="cfg-pin">
              <input
                id="cfg-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={PIN_MAX_DIGITOS}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/[^0-9]/g, ''))
                  setErrorPin(null)
                  setOkPin(null)
                }}
                className="input tabular-nums"
                placeholder={`${PIN_MIN_DIGITOS} a ${PIN_MAX_DIGITOS} dígitos`}
              />
            </Campo>

            <Campo etiqueta="Repetir PIN" htmlFor="cfg-pin-repetido">
              <input
                id="cfg-pin-repetido"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={PIN_MAX_DIGITOS}
                value={pinRepetido}
                onChange={(e) => {
                  setPinRepetido(e.target.value.replace(/[^0-9]/g, ''))
                  setErrorPin(null)
                  setOkPin(null)
                }}
                className="input tabular-nums"
                placeholder="Repite el PIN"
              />
            </Campo>
          </div>

          {errorPin && (
            <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{errorPin}</div>
          )}
          {okPin && <div className="aviso mb-4 border-ok-500/40 bg-ok-500/10 text-ok-500">{okPin}</div>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {hayPin && (
              <button
                type="button"
                onClick={() => void quitarPin()}
                disabled={guardandoPin}
                className="btn btn-danger-ghost mr-auto min-h-11 px-4"
              >
                Quitar PIN
              </button>
            )}
            <button type="submit" disabled={guardandoPin || !pin} className="btn btn-primary min-h-11 px-5">
              {guardandoPin ? 'Guardando…' : hayPin ? 'Cambiar PIN' : 'Guardar PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
