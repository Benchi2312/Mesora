import { useEffect, useState } from 'react'
import { supabase, supabaseConfigurado } from '../../lib/supabase'
import { PRECIO_PLAN_DEFECTO } from '../../domain/restaurant/configuracion'

export type LandingConfig = { precio: number; correo: string | null; telefono: string | null }

const correoEntorno = import.meta.env.VITE_MESORA_CONTACTO_EMAIL?.trim() || null
const correoComercialDefecto = 'mesoratech@gmail.com'

const configInicial: LandingConfig = {
  precio: PRECIO_PLAN_DEFECTO,
  correo: correoEntorno || correoComercialDefecto,
  telefono: null,
}

let cargaCompartida: Promise<LandingConfig> | undefined

function cargarConfiguracion(): Promise<LandingConfig> {
  if (cargaCompartida) return cargaCompartida
  cargaCompartida = (async () => {
    if (!supabaseConfigurado) return configInicial
    const { data } = await supabase
      .from('configuracion_global')
      .select('precio_plan_mensual, correo_soporte, telefono_soporte')
      .eq('id', 1)
      .maybeSingle()
    if (!data) return configInicial
    return {
      precio: data.precio_plan_mensual == null ? configInicial.precio : Number(data.precio_plan_mensual),
      // El correo comercial puede configurarse en Vercel o desde la tabla global.
      correo: correoEntorno || data.correo_soporte?.trim() || correoComercialDefecto,
      telefono: data.telefono_soporte?.trim() || null,
    }
  })().catch(() => configInicial)
  return cargaCompartida
}

export function useLandingConfig() {
  const [config, setConfig] = useState(configInicial)

  useEffect(() => {
    let activo = true
    void cargarConfiguracion().then((cargada) => {
      if (activo) setConfig(cargada)
    })
    return () => {
      activo = false
    }
  }, [])

  return config
}
