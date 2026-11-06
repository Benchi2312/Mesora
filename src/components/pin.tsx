import { useEffect, useState } from 'react'
import { getApi } from '../lib/api'
import { PIN_MAX_DIGITOS, PIN_MIN_DIGITOS } from '../domain/security/autorizacion'
import { Spinner } from './LoadingScreen'

/**
 * PIN de autorización para acciones sensibles: anular un ítem o cobro, cambiar
 * al mesero responsable de una mesa y mover consumo a otra mesa.
 *
 * Lo que decide esta pieza NO es si el PIN es correcto — eso solo lo sabe el
 * servidor, que compara contra el hash (`validar_pin_autorizacion`)—, sino si hay
 * que pedirlo. Sin PIN configurado el restaurante sigue funcionando como antes:
 * los que ya usaban Mesora no configuraron ninguno y no se les rompe nada el día
 * que se aplicó el cambio (ver la nota de supabase/pin_autorizacion.sql).
 *
 * Además se consulta una sola vez por restaurante y se recuerda en el módulo, así
 * que abrir un modal de autorización no hace un request extra cada vez.
 */
type Cache = { restauranteId: string; hayPin: boolean }

// Se guarda fuera del componente: varias pantallas (mesero, admin, cajero)
// preguntan lo mismo y todas deben obtener la misma respuesta.
let cache: Cache | null = null
// Una consulta por restaurante, no una global: si dos pantallas preguntan a la
// vez (o el usuario cambia de restaurante en la demo sin recargar), cada una tiene
// que recibir la respuesta de SU restaurante.
const enVuelo = new Map<string, Promise<Cache>>()

function preguntar(rid: string): Promise<Cache> {
  if (cache?.restauranteId === rid) return Promise.resolve(cache)
  const pendiente = enVuelo.get(rid)
  if (pendiente) return pendiente
  const peticion = getApi()
    .tienePinAutorizacion(rid)
    .then(({ data, error }) => {
      // Ante un error se asume que SÍ hay PIN: es la opción que no deja pasar una
      // anulación indebida. El backend igual valida, así que lo peor que pasa es
      // que se pida un PIN que el restaurante no tiene.
      const res: Cache = { restauranteId: rid, hayPin: error ? true : data === true }
      cache = res
      return res
    })
    .finally(() => {
      enVuelo.delete(rid)
    })
  enVuelo.set(rid, peticion)
  return peticion
}

/**Olvida el PIN cacheado (al cambiar de usuario o de restaurante en la demo). */
export function olvidarPinCacheado(): void {
  cache = null
}

/**
 * `cargando` es para el primer render: mientras no sabemos si el restaurante
 * tiene PIN no se muestra el campo (ni se pide un dato que quizá no existe), pero
 * tampoco se bloquea la acción: si al confirmar no se usó PIN y el restaurante sí
 * lo tenía, el backend responde y se muestra el error.
 */
export function usePinAutorizacion(rid: string | null | undefined): {
  pin: string
  setPin: (pin: string) => void
  /** El restaurante tiene PIN configurado: hay que pedirlo. */
  requierePin: boolean
  cargando: boolean
} {
  const [pin, setPin] = useState('')
  const [hayPin, setHayPin] = useState<boolean | null>(cache?.restauranteId === rid ? cache.hayPin : null)

  useEffect(() => {
    let vivo = true
    if (!rid) {
      setHayPin(null)
      return
    }
    const yaSabido = cache?.restauranteId === rid ? cache : null
    if (yaSabido) {
      setHayPin(yaSabido.hayPin)
      return
    }
    setHayPin(null)
    void preguntar(rid).then((res) => {
      if (vivo) setHayPin(res.hayPin)
    })
    return () => {
      vivo = false
    }
  }, [rid])

  // El PIN no se queda en memoria al cerrar el modal: se limpia al cambiar de
  // restaurante (y el modal se desmonta, pero el estado vive acá).
  useEffect(() => {
    setPin('')
  }, [rid])

  return { pin, setPin, requierePin: hayPin === true, cargando: hayPin === null }
}

/** Campo para teclear el PIN: numérico, con foco y sin pegarse de espacios. */
export function CampoPin({
  pin,
  onChange,
  error,
  etiqueta = 'PIN de autorización',
}: {
  pin: string
  onChange: (pin: string) => void
  error?: string | null
  etiqueta?: string
}) {
  return (
    <div className="mt-4">
      <label className="label" htmlFor="campo-pin-autorizacion">
        {etiqueta}
      </label>
      <input
        id="campo-pin-autorizacion"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- el foco tiene que
        // estar en el PIN: es lo único que hay que escribir en este modal.
        autoFocus
        maxLength={PIN_MAX_DIGITOS}
        value={pin}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder={'•'.repeat(PIN_MIN_DIGITOS)}
        className="input tabular-nums tracking-[0.5em]"
      />
      <p className="mt-1 text-xs text-zinc-500">
        {PIN_MIN_DIGITOS} a {PIN_MAX_DIGITOS} dígitos. Lo define el administrador del restaurante.
      </p>
      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
    </div>
  )
}

/** Texto de ayuda cuando la pantalla muestra acciones que piden PIN. */
export function AvisoPin({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
      <Spinner className="h-3 w-3" />
      Revisando si el restaurante tiene PIN…
    </p>
  )
}
