export async function mensajeErrorFuncion(error: unknown, alternativo: string): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      const body = await context.clone().json().catch(() => null) as { error?: unknown } | null
      if (typeof body?.error === 'string' && body.error.trim()) return body.error
    }
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return alternativo
}
