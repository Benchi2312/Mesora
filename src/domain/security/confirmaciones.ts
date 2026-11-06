export const TEXTO_AUDITORIA = 'La acción se guardará en el registro de auditoría con quién, cuándo, el restaurante y los datos del cambio.'

export interface ResumenConfirmacion {
  accion: string
  datosAfectados: string
  pinGerente: string
  auditoria: string
}

function resumen(accion: string, datosAfectados: string, requierePin: boolean): ResumenConfirmacion {
  return {
    accion,
    datosAfectados,
    pinGerente: requierePin
      ? 'Sí. Se validará el PIN configurado antes de guardar.'
      : 'No. Este restaurante no tiene un PIN de gerente configurado para esta acción.',
    auditoria: TEXTO_AUDITORIA,
  }
}

export function confirmarAnulacionItem(datos: {
  producto: string
  cantidad: number
  importe: string
  mesa: string
  liberaMesa: boolean
  requierePin: boolean
}): ResumenConfirmacion {
  return resumen(
    'Anular el ítem seleccionado',
    `${datos.cantidad} × ${datos.producto} (${datos.importe}) en ${datos.mesa}. No se cobrará y dejará de figurar en cocina.${datos.liberaMesa ? ' Es el último ítem abierto: al anularlo se liberará la mesa.' : ''}`,
    datos.requierePin,
  )
}

export function confirmarAnulacionCuenta(datos: {
  boleta: string
  total: string
  propina: string
  reembolso: string
  motivo: string
  requierePin: boolean
}): ResumenConfirmacion {
  return resumen(
    'Anular una cuenta ya cobrada y devolver el dinero',
    `Boleta ${datos.boleta}: venta ${datos.total}, propina ${datos.propina}, devolución total ${datos.reembolso}. Se registrará el motivo «${datos.motivo}»; la venta se excluirá del reporte y el efectivo devuelto se reflejará en el arqueo.`,
    datos.requierePin,
  )
}

export function confirmarMovimientoConsumo(datos: {
  origen: string
  destino: string
  comandas: number
  importe: string
  motivo: string
  requierePin: boolean
}): ResumenConfirmacion {
  return resumen(
    'Mover el consumo pendiente a otra mesa',
    `${datos.comandas} ${datos.comandas === 1 ? 'comanda' : 'comandas'} (${datos.importe}) de ${datos.origen} a ${datos.destino}. La mesa de origen quedará libre; los pagos ya emitidos no cambiarán. Motivo: «${datos.motivo}».`,
    datos.requierePin,
  )
}

export function confirmarCambioMesero(datos: {
  mesa: string
  anterior: string
  nuevo: string
  comandas: number
  importe: string
  motivo: string
  requierePin: boolean
}): ResumenConfirmacion {
  return resumen(
    'Pasar la responsabilidad de la mesa a otro mesero',
    `${datos.mesa}: ${datos.anterior} → ${datos.nuevo}. ${datos.comandas} ${datos.comandas === 1 ? 'comanda' : 'comandas'} abierta${datos.comandas === 1 ? '' : 's'} (${datos.importe}). Las ventas anteriores conservarán el mesero que las registró. Motivo: «${datos.motivo}».`,
    datos.requierePin,
  )
}

export function confirmarCierreCaja(datos: {
  declarado: string
  esperado: string
  diferencia: string
  mesasPendientes: number
  totalPendiente: string
  observaciones: string
}): ResumenConfirmacion {
  const pendientes = datos.mesasPendientes
    ? ` Quedan ${datos.mesasPendientes} ${datos.mesasPendientes === 1 ? 'mesa' : 'mesas'} sin cobrar (${datos.totalPendiente}); esos consumos seguirán abiertos para el siguiente turno.`
    : ' No quedan mesas pendientes de cobro.'
  const observaciones = datos.observaciones ? ` Observación: «${datos.observaciones}».` : ''
  return resumen(
    'Cerrar el turno de caja y guardar el arqueo',
    `Efectivo contado: ${datos.declarado}; efectivo esperado: ${datos.esperado}; diferencia: ${datos.diferencia}.${pendientes}${observaciones}`,
    false,
  )
}
