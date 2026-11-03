import { createBrowserRouter, Navigate } from 'react-router-dom'
import type { ComponentType } from 'react'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Restablecer from './pages/Restablecer'
import VerificarCorreoRecuperacion from './pages/VerificarCorreoRecuperacion'
import SuscripcionVencida from './pages/SuscripcionVencida'
import Landing from './pages/landing/Landing'
import NotFound from './pages/NotFound'
import SuperAdminLayout from './pages/superadmin/SuperAdminLayout'
import DemoMode from './demo/DemoMode'

/**
 * Code-splitting por ruta: la landing y el login cargan al instante y el panel
 * (que arrastra Supabase, generación de PDF y las cuatro vistas) se descarga
 * solo cuando el usuario entra. Sin esto, un visitante de la landing bajaba
 * ~1.3 MB de JavaScript que nunca iba a ejecutar.
 */
const pagina =
  (cargar: () => Promise<{ default: ComponentType }>) =>
  async (): Promise<{ Component: ComponentType }> => ({ Component: (await cargar()).default })


const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/restablecer', element: <Restablecer /> },
  { path: '/verificar-correo-recuperacion', element: <VerificarCorreoRecuperacion /> },
  { path: '/suscripcion-vencida', element: <SuscripcionVencida /> },
  {
    path: '/demo',
    element: <DemoMode />,
    children: [
      { index: true, element: <Navigate to="/demo/admin" replace /> },
      { path: 'admin', lazy: pagina(() => import('./pages/admin/Admin')) },
      { path: 'mesero', lazy: pagina(() => import('./pages/mesero/Mesero')) },
      { path: 'cocina', lazy: pagina(() => import('./pages/cocina/Cocina')) },
      { path: 'cajero', lazy: pagina(() => import('./pages/cajero/Cajero')) },
    ],
  },
  {
    element: (
      <ProtectedRoute roles={['super_admin']}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        element: <SuperAdminLayout />,
        children: [
          { path: '/super-admin', lazy: pagina(() => import('./pages/superadmin/SuperAdmin')) },
          {
            path: '/super-admin/restaurantes',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminRestaurantes')),
          },
          {
            path: '/super-admin/restaurantes/:rid',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminRestauranteDetalle')),
          },
          {
            path: '/super-admin/administradores',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminAdministradores')),
          },
          {
            path: '/super-admin/usuarios',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminUsuarios')),
          },
          {
            path: '/super-admin/suscripciones',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminSuscripciones')),
          },
          {
            path: '/super-admin/estadisticas',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminEstadisticas')),
          },
          {
            path: '/super-admin/auditoria',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminAuditoria')),
          },
          {
            path: '/super-admin/notificaciones',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminNotificaciones')),
          },
          {
            path: '/super-admin/soporte',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminSoporte')),
          },
          {
            path: '/super-admin/configuracion',
            lazy: pagina(() => import('./pages/superadmin/SuperAdminConfiguracion')),
          },
        ],
      },
    ],
  },
  {
    element: (
      <ProtectedRoute roles={['admin_restaurante']}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [{ path: '/admin', lazy: pagina(() => import('./pages/admin/Admin')) }],
  },
  {
    element: (
      <ProtectedRoute roles={['mesero']}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [{ path: '/mesero', lazy: pagina(() => import('./pages/mesero/Mesero')) }],
  },
  {
    element: (
      <ProtectedRoute roles={['cocina']}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [{ path: '/cocina', lazy: pagina(() => import('./pages/cocina/Cocina')) }],
  },
  {
    element: (
      <ProtectedRoute roles={['cajero', 'admin_restaurante']}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [{ path: '/cajero', lazy: pagina(() => import('./pages/cajero/Cajero')) }],
  },
  { path: '/', element: <Landing /> },
  { path: '*', element: <NotFound /> },
])

export default router
