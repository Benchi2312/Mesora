import { createServer } from 'vite'

const [, , root, envDir, puerto] = process.argv
if (!root || !envDir || !puerto) throw new Error('Uso: qa-vite.mjs <raiz> <envDir> <puerto>')

process.env.VITE_MESORA_MODO_LOCAL = 'true'
const server = await createServer({
  root,
  envDir,
  server: { host: '127.0.0.1', port: Number(puerto), strictPort: true },
})
await server.listen()
