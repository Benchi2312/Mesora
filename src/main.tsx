import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './App'
import { useAuthStore } from './store/auth'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import { iniciarDiagnostico } from './lib/diagnostico'

iniciarDiagnostico()

if (import.meta.env.DEV) {
  console.log('api antes del render:', (globalThis as any).__mesoraDebug?.())
}

// DEMO MODE: en las rutas /demo/* no se inicializa Supabase (no hay credenciales
// red en el init se ignora en silencio para no romper la app.
const esRutaDemo = window.location.pathname.startsWith('/demo')
if (!esRutaDemo) {
  void useAuthStore
    .getState()
    .initialize()
    .catch(() => {
      // Silencioso: sin backend el init no debe romper ni mostrar errores.
    })
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
)
