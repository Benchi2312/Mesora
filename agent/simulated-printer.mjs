export class ImpresoraSimulada {
  constructor(nombres = ['Mesora Simulada Cocina', 'Mesora Simulada Barra']) {
    this.nombres = nombres
    this.envios = []
  }

  async listar() { return [...this.nombres] }

  async imprimir(trabajo) {
    if (!this.nombres.includes(trabajo.cola_windows)) throw new Error('La cola simulada no existe.')
    this.envios.push({ trabajo_id: trabajo.id, cola: trabajo.cola_windows, copias: trabajo.copias })
    return { enviadoACola: true, impresionFisicaConfirmada: false }
  }
}
