export type CategoriaErrorCloudinary = 'cloud_name' | 'credentials' | 'asset_folder' | 'folder' | 'provider'

export function clasificarErrorCloudinary(status: number, message: string): CategoriaErrorCloudinary {
  const normalizado = message.toLocaleLowerCase()
  if (/unknown cloud|cloud name.{0,20}(invalid|unknown)|invalid cloud/.test(normalizado)) return 'cloud_name'
  if (status === 401 || /invalid signature|invalid api.?key|authentication|unauthori[sz]ed/.test(normalizado)) return 'credentials'
  if (normalizado.includes('asset_folder')) return 'asset_folder'
  if (/upload preset|invalid folder|folder (name|path)|folder.{0,30}(not found|not allowed|does not exist|invalid)/.test(normalizado)) return 'folder'
  return 'provider'
}

export function mensajeErrorCloudinary(code: string): string {
  switch (code) {
    case 'CLOUDINARY_cloud_name':
      return 'Cloudinary no reconoce la cuenta configurada. Verifica CLOUDINARY_CLOUD_NAME en los secretos de Supabase.'
    case 'CLOUDINARY_credentials':
      return 'Cloudinary rechazó la API key o la firma. Verifica CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en los secretos de Supabase.'
    case 'CLOUDINARY_asset_folder':
      return 'Cloudinary rechazó asset_folder. Confirma que el entorno Cloudinary configurado para Mesora tenga Carpetas dinámicas activas.'
    case 'CLOUDINARY_folder':
      return 'Cloudinary rechazó la ruta de carpeta configurada. Verifica que mesora/products sea una ruta válida en ese entorno.'
    default:
      return 'Cloudinary no pudo guardar la imagen. Revisa la configuración del servicio e inténtalo de nuevo.'
  }
}
