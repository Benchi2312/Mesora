import type { AuditLog } from '../../types/database'
import { fmtFecha } from '../../lib/format'
import { etiquetaAccionAuditoria } from './auditoria'
import { normalizarContenidoUtf8, normalizarTextoUtf8 } from './normalizarUtf8'

const MODULOS: Record<string, string> = {
  usuario: 'Personal',
  mesa: 'Mesas',
  caja_turno: 'Caja',
  cuenta: 'Cobros',
  pedido: 'Comandas',
  pedido_item: 'Comandas',
  entrega_comanda: 'Impresión de comandas',
  configuracion: 'Configuración',
  suscripcion: 'Suscripciones',
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? normalizarTextoUtf8(valor.trim()) : null
}

/** Solo normaliza texto visible; el JSON original y los contratos permanecen intactos. */
export function textoReciboInterno(valor: string): string {
  const texto = valor.replace(/\bboletas?\b/gi, (palabra) => {
    const reemplazo = palabra.toLowerCase() === 'boletas' ? 'recibos internos' : 'recibo interno'
    return palabra[0] === palabra[0].toUpperCase()
      ? reemplazo[0].toUpperCase() + reemplazo.slice(1)
      : reemplazo
  })
  return texto
    .replace(/(\brecibo interno(?:\s+[\w-]+)?\s+)anulada\b/gi, '$1anulado')
    .replace(/(\brecibo interno(?:\s+[\w-]+)?\s+anulado\s+y\s+)reembolsada\b/gi, '$1reembolsado')
    .replace(/(\brecibos internos\s+)anuladas\b/gi, '$1anulados')
}

export function presentarAuditoria(log: AuditLog) {
  const detalle = normalizarContenidoUtf8(log.detalle) ?? {}
  const entidad = log.entidad ?? ''
  const modulo = MODULOS[entidad] ?? (texto(entidad)?.replaceAll('_', ' ') ?? 'Otro')
  const numero = texto(detalle.numero)
  const mesa = texto(detalle.mesa_nombre)
  const producto = texto(detalle.producto)
  const nombre = texto(detalle.usuario_nombre) ?? texto(detalle.nombre)
  const objetivo = numero && entidad === 'cuenta' ? `Recibo interno ${numero}`
    : producto ? `Ítem «${producto}»${mesa ? ` · ${mesa}` : ''}`
      : mesa ? mesa
        : nombre ? nombre
          : log.entidad_id ? `${modulo} · ${log.entidad_id.slice(0, 8)}` : 'No indicado'
  const motivo = texto(detalle.motivo) ?? texto(detalle.motivo_anulacion) ?? 'No indicado'
  const resultado = typeof detalle.activo_nuevo === 'boolean'
    ? detalle.activo_nuevo ? 'Acceso activo' : 'Acceso desactivado'
    : texto(detalle.resultado) ?? (log.accion === 'cuenta_anular' ? 'Recibo interno anulado' : 'Acción registrada')

  return {
    accion: textoReciboInterno(normalizarTextoUtf8(log.descripcion || etiquetaAccionAuditoria(log.accion))),
    usuario: `${texto(log.actor_nombre) ?? 'Usuario del sistema'}${log.actor_rol ? ` · ${log.actor_rol}` : ''}`,
    fecha: fmtFecha(log.created_at),
    modulo,
    objetivo,
    motivo,
    resultado: textoReciboInterno(resultado),
    json: Object.keys(detalle).length ? JSON.stringify(detalle, null, 2) : null,
  }
}
