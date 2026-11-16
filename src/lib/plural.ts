export function cantidadConNombre(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
}

export function resultadosEncontrados(cantidad: number): string {
  return `Se ${cantidad === 1 ? 'muestra' : 'muestran'} ${cantidadConNombre(cantidad, 'resultado', 'resultados')}.`
}
