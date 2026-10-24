import type { Rol } from '../types/database'

export const ROLES: readonly Rol[] = ['super_admin', 'admin_restaurante', 'mesero', 'cocina', 'cajero']

export const HOME_BY_ROLE: Record<Rol, string> = {
  super_admin: '/super-admin',
  admin_restaurante: '/admin',
  mesero: '/mesero',
  cocina: '/cocina',
  cajero: '/cajero',
}

export const ROL_LABELS: Record<Rol, string> = {
  super_admin: 'Super Admin',
  admin_restaurante: 'Admin',
  mesero: 'Mesero',
  cocina: 'Cocina',
  cajero: 'Cajero',
}

export function homeForRole(rol: Rol): string {
  return HOME_BY_ROLE[rol] ?? `/login`
}

export function rolLabel(rol: Rol): string {
  return ROL_LABELS[rol] ?? rol
}