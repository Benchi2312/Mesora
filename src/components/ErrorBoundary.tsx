import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string | null
}

/**
 * Captura errores de render para que una pantalla con un error inesperado no
 * deje todo el árbol en blanco. Muestra un mensaje amigable y un botón para
 * recargar la vista.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null }

  static getDerivedStateFromError(): State {
    return { hasError: true, message: 'Error inesperado' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Conserva diagnóstico en desarrollo; no expone detalles en pantalla o producción.
    if (import.meta.env.DEV) console.error('Error inesperado de interfaz', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-950 px-4 text-center">
          <p className="text-5xl font-black text-brand-500">Ups</p>
          <p className="max-w-md text-sm text-zinc-400">
            Algo salió mal al mostrar esta página. {this.state.message}. Recarga para intentar de nuevo.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-surface-950 transition hover:bg-brand-400"
          >
            Recargar vista
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
