import { crearHandlerCloudinary } from './handler.ts'
import {
  validarArchivoImagenProducto,
  validarContenidoImagenProducto,
  validarUrlImagenProducto,
} from '../../../src/domain/restaurant/imagenProducto.ts'

const RESTAURANTE = '11111111-1111-4111-8111-111111111111'
const OTRO_RESTAURANTE = '22222222-2222-4222-8222-222222222222'
const ADMIN_ID = '33333333-3333-4333-8333-333333333333'
const ORIGEN = 'https://mesora-sistema.vercel.app'

const archivos: Record<string, Uint8Array> = {
  'image/jpeg': new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
  'image/png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
}

function entorno(opciones: {
  rol?: string
  activo?: boolean
  restauranteId?: string | null
  usuario?: boolean
  enUso?: boolean
  errorSubida?: boolean
} = {}) {
  const subidas: string[] = []
  const eliminadas: string[] = []
  const handler = crearHandlerCloudinary({
    usuarioDesdeRequest: async () => opciones.usuario === false ? null : { id: ADMIN_ID },
    perfilDeUsuario: async () => ({
      rol: opciones.rol ?? 'admin_restaurante',
      activo: opciones.activo ?? true,
      restaurante_id: opciones.restauranteId === undefined ? RESTAURANTE : opciones.restauranteId,
    }),
    imagenEstaEnUso: async () => opciones.enUso ?? false,
    subirImagen: async (_file, rid) => {
      if (opciones.errorSubida) throw new Error('private-cloud-secret-must-not-appear')
      subidas.push(rid)
      return { secureUrl: 'https://res.cloudinary.com/demo/image/upload/mesora/products/test.jpg', publicId: `${rid}_44444444-4444-4444-8444-444444444444` }
    },
    eliminarImagen: async (publicId) => { eliminadas.push(publicId); return 'ok' },
  })
  return { handler, subidas, eliminadas }
}

function requestSubida(mime: string, bytes = archivos[mime], filename = `producto.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}`, restauranteId = RESTAURANTE) {
  const form = new FormData()
  form.set('restaurante_id', restauranteId)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  form.set('archivo', new File([buffer], filename, { type: mime }))
  return new Request('https://mesora-sistema.vercel.app/functions/v1/cloudinary-producto', {
    method: 'POST', headers: { origin: ORIGEN, authorization: 'Bearer fixture-session' }, body: form,
  })
}

async function json(response: Response) { return await response.json() as Record<string, unknown> }

Deno.test('Cloudinary producto: el preflight OPTIONS devuelve 204 sin cuerpo y permite el origen de producción', async () => {
  const response = await entorno().handler(new Request('https://mesora-sistema.vercel.app/functions/v1/cloudinary-producto', {
    method: 'OPTIONS',
    headers: {
      origin: ORIGEN,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, apikey, content-type',
    },
  }))
  if (response.status !== 204) throw new Error(`Se esperaba HTTP 204 para preflight, se recibió ${response.status}.`)
  if (await response.text() !== '') throw new Error('El preflight 204 no debe incluir un cuerpo.')
  if (response.headers.get('access-control-allow-origin') !== ORIGEN) throw new Error('El preflight no permitió el origen de producción.')
  if (!response.headers.get('access-control-allow-headers')?.includes('authorization')) throw new Error('El preflight no permitió el encabezado de sesión.')
})

Deno.test('Cloudinary producto: JPG, PNG y WebP se validan y se suben al restaurante de la sesión', async () => {
  for (const mime of Object.keys(archivos)) {
    const env = entorno()
    const response = await env.handler(requestSubida(mime))
    const body = await json(response)
    if (response.status !== 200 || typeof body.secure_url !== 'string' || typeof body.public_id !== 'string') {
      throw new Error(`No se aceptó el formato admitido ${mime}.`)
    }
    if (env.subidas.length !== 1 || env.subidas[0] !== RESTAURANTE) throw new Error('El upload no quedó aislado al restaurante autenticado.')
  }
})

Deno.test('Cloudinary producto: exige sesión, admin activo y restaurante asignado', async () => {
  const form = requestSubida('image/jpeg')
  const casos = [
    { usuario: false, status: 401 },
    { rol: 'mesero', status: 403 },
    { activo: false, status: 403 },
    { restauranteId: null, status: 403 },
  ]
  for (const caso of casos) {
    const response = await entorno(caso).handler(form.clone())
    if (response.status !== caso.status) throw new Error(`Se esperaba HTTP ${caso.status}, se recibió ${response.status}.`)
  }
})

Deno.test('Cloudinary producto: rechaza extensiones, MIME y cabeceras binarias que no coinciden', async () => {
  const invalido = await entorno().handler(requestSubida('image/jpeg', new Uint8Array([1, 2, 3]), 'falso.jpg'))
  if (invalido.status !== 400) throw new Error('Se aceptaron bytes que no son JPEG.')
  const tipo = await entorno().handler(requestSubida('image/gif', new Uint8Array([0x47, 0x49, 0x46]), 'falso.gif'))
  if (tipo.status !== 400) throw new Error('Se aceptó un tipo GIF no permitido.')
})

Deno.test('Cloudinary producto: limita el archivo a 5 MB', async () => {
  const grande = new Uint8Array(5 * 1024 * 1024 + 1)
  grande.set(archivos['image/jpeg'])
  const response = await entorno().handler(requestSubida('image/jpeg', grande, 'grande.jpg'))
  if (response.status !== 413) throw new Error('Se aceptó un archivo mayor a 5 MB.')
})

Deno.test('Cloudinary producto: el tenant se deriva del perfil y no de un formulario manipulado', async () => {
  const env = entorno()
  const response = await env.handler(requestSubida('image/jpeg', archivos['image/jpeg'], 'producto.jpg', OTRO_RESTAURANTE))
  if (response.status !== 403 || env.subidas.length !== 0) throw new Error('Una solicitud con otro restaurante llegó a Cloudinary.')
})

Deno.test('Cloudinary producto: sanea errores de Cloudinary y conserva la posibilidad de reintentar', async () => {
  const response = await entorno({ errorSubida: true }).handler(requestSubida('image/jpeg'))
  const body = await json(response)
  if (response.status !== 502 || String(body.error).includes('private-cloud-secret')) throw new Error('La respuesta filtró detalles internos del proveedor.')
})

Deno.test('Cloudinary producto: solo elimina IDs de este tenant que ya no estén vinculados', async () => {
  const publicId = `${RESTAURANTE}_44444444-4444-4444-8444-444444444444`
  const crearRequest = (id: string) => new Request('https://mesora-sistema.vercel.app/functions/v1/cloudinary-producto', {
    method: 'POST', headers: { origin: ORIGEN, authorization: 'Bearer fixture-session', 'content-type': 'application/json' },
    body: JSON.stringify({ accion: 'eliminar', public_id: id }),
  })
  const usada = await entorno({ enUso: true }).handler(crearRequest(publicId))
  if (usada.status !== 409) throw new Error('Se permitió borrar un asset vinculado a un producto.')
  const ajena = await entorno().handler(crearRequest(`${OTRO_RESTAURANTE}_44444444-4444-4444-8444-444444444444`))
  if (ajena.status !== 403) throw new Error('Se permitió borrar un asset de otro restaurante.')
  const env = entorno()
  const respuesta = await env.handler(crearRequest(publicId))
  if (respuesta.status !== 200 || env.eliminadas[0] !== publicId) throw new Error('No se eliminó el asset propio sin referencias.')
})

Deno.test('Cloudinary producto: origen externo no autorizado queda bloqueado', async () => {
  const request = new Request('https://mesora-sistema.vercel.app/functions/v1/cloudinary-producto', {
    method: 'POST', headers: { origin: 'https://otro-sitio.example', authorization: 'Bearer fixture-session' },
  })
  if ((await entorno().handler(request)).status !== 403) throw new Error('Se aceptó un origen no permitido.')
})

Deno.test('Cloudinary producto: validación de archivo y URLs no admite rutas locales ni HTTP', () => {
  const jpg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'foto.jpg', { type: 'image/jpeg' })
  const limite = new File([new Uint8Array(5 * 1024 * 1024)], 'limite.webp', { type: 'image/webp' })
  const excedido = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' })
  const gif = new File([new Uint8Array([1])], 'archivo.gif', { type: 'image/gif' })
  if (validarArchivoImagenProducto(jpg) || validarArchivoImagenProducto(limite)) throw new Error('Se rechazó un archivo permitido.')
  if (!validarArchivoImagenProducto(excedido) || !validarArchivoImagenProducto(gif)) throw new Error('Se aceptó un archivo que debía rechazarse.')
  if (!validarContenidoImagenProducto(archivos['image/jpeg'], 'image/jpeg')) throw new Error('Se rechazaron bytes JPEG válidos.')
  if (validarContenidoImagenProducto(archivos['image/png'], 'image/jpeg')) throw new Error('Se aceptó una discrepancia de firma binaria.')
  if (validarUrlImagenProducto('C:\\Users\\local\\foto.jpg') === null) throw new Error('Se aceptó una ruta local de Windows.')
  if (validarUrlImagenProducto('file:///tmp/foto.jpg') === null) throw new Error('Se aceptó una URL file:.')
  if (validarUrlImagenProducto('http://images.example.invalid/foto.jpg') === null) throw new Error('Se aceptó HTTP sin TLS.')
  if (validarUrlImagenProducto('https://images.example.invalid/foto.jpg') !== null) throw new Error('Se rechazó una URL HTTPS válida.')
})
