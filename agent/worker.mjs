const ESPERA_VACIA_MS = 5000

export class AgenteMesora {
  constructor({ transporte, impresora, almacen, token, informar = () => {} }) {
    this.transporte = transporte
    this.impresora = impresora
    this.almacen = almacen
    this.token = token
    this.informar = informar
    this.ultimoHeartbeat = 0
  }

  async estado(estado, detalle = '') {
    const visible = { estado, detalle: String(detalle).replaceAll(this.token, '[token oculto]'), pid: process.pid }
    await this.almacen.guardarEstado(visible)
    this.informar(visible)
  }

  async confirmarRecibo() {
    const recibo = await this.almacen.leerRecibo()
    if (!recibo) return false
    await this.transporte.rpc('agente_impresion_confirmar', {
      p_token: this.token, p_trabajo_id: recibo.id, p_reclamo_id: recibo.reclamo_id,
    })
    await this.almacen.borrarRecibo()
    await this.estado('enviado a cola', `Trabajo ${recibo.id} confirmado en Mesora. Papel físico sin verificar.`)
    return true
  }

  async ciclo() {
    // Un recibo local se confirma antes de reclamar otro trabajo. Jamás se
    // vuelve a imprimir un trabajo cuyo spooler ya aceptó el envío.
    await this.confirmarRecibo()
    const instaladas = await this.impresora.listar()
    if (Date.now() - this.ultimoHeartbeat >= 30000) {
      await this.transporte.rpc('agente_impresion_heartbeat', {
        p_token: this.token, p_impresoras: instaladas,
      })
      this.ultimoHeartbeat = Date.now()
      await this.estado('conectado', `${instaladas.length} impresoras Windows detectadas.`)
    }
    const trabajo = await this.transporte.rpc('agente_impresion_reclamar', { p_token: this.token })
    if (!trabajo) return false
    await this.estado('preparando', `Trabajo ${trabajo.id} · ${trabajo.estacion} · intento ${trabajo.numero_intento}.`)
    if (!instaladas.includes(trabajo.cola_windows)) {
      await this.transporte.rpc('agente_impresion_fallar', {
        p_token: this.token, p_trabajo_id: trabajo.id, p_reclamo_id: trabajo.reclamo_id,
        p_error: 'La impresora configurada no está instalada en Windows.', p_reintento_seguro: true,
      })
      await this.estado('impresora no disponible', `Trabajo ${trabajo.id}; se reintentará según la política configurada.`)
      return true
    }
    await this.transporte.rpc('agente_impresion_iniciar_envio', {
      p_token: this.token, p_trabajo_id: trabajo.id, p_reclamo_id: trabajo.reclamo_id,
    })
    try {
      const resultado = await this.impresora.imprimir(trabajo)
      if (!resultado?.enviadoACola || resultado.impresionFisicaConfirmada === true) {
        throw new Error('No se obtuvo una confirmación válida de la cola Windows.')
      }
    } catch {
      // Tras iniciar el spooler el resultado puede ser incierto. Se detiene el
      // reintento automático para evitar una segunda copia accidental.
      await this.transporte.rpc('agente_impresion_fallar', {
        p_token: this.token, p_trabajo_id: trabajo.id, p_reclamo_id: trabajo.reclamo_id,
        p_error: 'Windows no confirmó el envío a la cola. Revisa la impresora antes de reimprimir.',
        p_reintento_seguro: false,
      })
      await this.estado('fallido', `Trabajo ${trabajo.id}; requiere revisión manual.`)
      return true
    }
    await this.almacen.guardarRecibo({ id: trabajo.id, reclamo_id: trabajo.reclamo_id })
    await this.confirmarRecibo()
    return true
  }

  async ejecutar({ signal } = {}) {
    await this.estado('iniciando', 'Conectando con Mesora.')
    while (!signal?.aborted) {
      try {
        const huboTrabajo = await this.ciclo()
        if (huboTrabajo) continue
      } catch (error) {
        if (/agente no autorizado|agente.*revocado/i.test(error.message)) {
          await this.estado('revocado', 'El vínculo ya no está autorizado. Solicita un código nuevo al administrador.')
          return
        }
        await this.estado('desconectado', error.message)
      }
      await new Promise((resolve) => {
        const temporizador = setTimeout(resolve, ESPERA_VACIA_MS)
        if (signal) signal.addEventListener('abort', () => { clearTimeout(temporizador); resolve() }, { once: true })
      })
    }
    await this.estado('detenido', 'Agente detenido por el usuario.')
  }
}
