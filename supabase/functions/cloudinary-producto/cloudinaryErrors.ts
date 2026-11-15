export type CategoriaErrorCloudinary = 'cloud_name' | 'credentials' | 'folder' | 'provider'

export function clasificarErrorCloudinary(status: number, message: string): CategoriaErrorCloudinary {
  const normalizado = message.toLocaleLowerCase()
  if (/unknown cloud|cloud name.{0,20}(invalid|unknown)|invalid cloud/.test(normalizado)) return 'cloud_name'
  if (/folder|upload preset/.test(normalizado)) return 'folder'
  if (status === 401 || /invalid signature|invalid api.?key|authentication|unauthori[sz]ed/.test(normalizado)) return 'credentials'
  return 'provider'
}

export function mensajeErrorCloudinary(code: string): string {
  switch (code) {
    case 'CLOUDINARY_cloud_name':
      return 'Cloudinary no reconoce la cuenta configurada. Verifica CLOUDINARY_CLOUD_NAME en los secretos de Supabase.'
    case 'CLOUDINARY_credentials':
      return 'Cloudinary rechazó la API key o la firma. Verifica CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en los secretos de Supabase.'
    case 'CLOUDINARY_folder':
      return 'Cloudinary rechazó la carpeta. CLOUDINARY_FOLDER debe ser mesora/products.'
    default:
      return 'Cloudinary no pudo guardar la imagen. Revisa la configuración del servicio e inténtalo de nuevo.'
  }
}
