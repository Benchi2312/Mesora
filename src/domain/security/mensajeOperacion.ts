/** Traduce fallos técnicos frecuentes a instrucciones concretas para el local. */
export function mensajeOperacion(error: string | null | undefined, alternativo: string): string {
  const detalle = error?.trim() ?? ''
  if (!detalle) return alternativo

  if (/pin de autorizaci[oó]n incorrecto/i.test(detalle)) {
    return 'El PIN no coincide. Revísalo con el gerente e inténtalo de nuevo.'
  }
  if (/falta el pin|se requiere.*pin|pin.*obligatorio/i.test(detalle)) {
    return 'Ingresa el PIN del gerente para continuar.'
  }
  if (/sin permiso|sin acceso|no tienes permiso/i.test(detalle)) {
    return 'Tu perfil no tiene permiso para realizar este cambio. Pide ayuda al administrador del restaurante.'
  }
  if (/mesa.*asignada a otro mesero/i.test(detalle)) {
    return 'Esta mesa quedó a cargo de otro mesero. Actualiza las mesas o pide al administrador que te ayude.'
  }
  if (/no hay ning[uú]n turno de caja abierto|no existe.*turno.*abierto/i.test(detalle)) {
    return 'La caja ya no tiene un turno abierto. Actualiza la pantalla para revisar su estado.'
  }
  if (/esta boleta ya fue anulada/i.test(detalle)) {
    return 'Esta boleta ya se anuló. Actualiza la lista para ver el estado más reciente.'
  }
  if (/solo se puede anular una cuenta cobrada/i.test(detalle)) {
    return 'La cuenta ya no figura como cobrada. Actualiza la lista antes de continuar.'
  }
  if (/no se encontraron comandas pendientes|no tiene consumo pendiente/i.test(detalle)) {
    return 'No queda consumo pendiente para mover. Actualiza las mesas y vuelve a revisar.'
  }
  if (/el mesero elegido no est[aá] activo/i.test(detalle)) {
    return 'Ese mesero ya no está disponible. Actualiza la lista y elige a otra persona.'
  }
  if (/failed to fetch|fetch failed|networkerror|network request failed|timeout/i.test(detalle)) {
    return 'No se pudo conectar. Revisa internet y actualiza la pantalla antes de repetir la operación.'
  }
  if (/row-level security|violates.*constraint|duplicate key|could not find the .*column|column .* does not exist|pgrst\d{3}/i.test(detalle)) {
    return 'No se pudo guardar el cambio. Actualiza la pantalla; si vuelve a ocurrir, avisa al administrador.'
  }

  return detalle
}
