import { useEffect, useState } from 'react'
import type { Mesa } from '../../types/database'
import { useCurrentContext } from '../../lib/useCurrentContext'
import MesaGrid from './MesaGrid'
import MesaOcupada from './MesaOcupada'
import MenuPicker from './MenuPicker'
import CerrarCuenta from './CerrarCuenta'
import PageHeader from '../../components/PageHeader'

type Vista = 'mesas' | 'pedido' | 'mesaOcupada' | 'cuenta'

export default function Mesero() {
  const { restaurante } = useCurrentContext()
  const [vista, setVista] = useState<Vista>('mesas')
  const [mesa, setMesa] = useState<Mesa | null>(null)
  /** A dónde vuelve MenuPicker y a dónde regresa el mesero tras enviar la comanda. */
  const [origen, setOrigen] = useState<'mesas' | 'mesaOcupada'>('mesas')
  const [flash, setFlash] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  function handleSelectMesa(m: Mesa, ocupada: boolean) {
    setMesa(m)
    setOrigen(ocupada ? 'mesaOcupada' : 'mesas')
    setVista(ocupada ? 'mesaOcupada' : 'pedido')
  }

  function comandaEnviada() {
    setFlash('Comanda enviada a cocina.')
    // Si la mesa ya tenía pedidos, el mesero sigue en la mesa para poder cobrar o
    // sumar otra comanda; si estaba libre, vuelve al mapa (la mesa ya está ocupada).
    setVista(origen === 'mesaOcupada' ? 'mesaOcupada' : 'mesas')
    setTick((t) => t + 1)
  }

  function cuentaCerrada() {
    setFlash('Cuenta cobrada. Mesa liberada.')
    setVista('mesas')
    setTick((t) => t + 1)
  }

  function consumoMovido(mensaje: string) {
    setFlash(mensaje)
    setVista('mesas')
    setTick((t) => t + 1)
  }

  return (
    <div>
      <PageHeader
        titulo={restaurante?.nombre ?? 'Mesero'}
        descripcion="Toma de pedidos y cierre de cuentas"
      />

      {flash && (
        <div className="mb-4 rounded-lg border border-ok-500/40 bg-ok-500/10 px-4 py-2.5 text-sm text-ok-500">
          {flash}
        </div>
      )}

      {vista === 'mesas' && <MesaGrid key={tick} onSelectMesa={handleSelectMesa} />}

      {vista === 'pedido' && mesa && (
        <MenuPicker
          key={`pedido-${mesa.id}-${tick}`}
          mesa={mesa}
          textoVolver={origen === 'mesaOcupada' ? '← Volver a la mesa' : '← Volver a mesas'}
          onVolver={() => setVista(origen)}
          onComandaEnviada={comandaEnviada}
        />
      )}

      {vista === 'mesaOcupada' && mesa && (
        <MesaOcupada
          key={`ocupada-${mesa.id}-${tick}`}
          mesa={mesa}
          onVolver={() => { setVista('mesas'); setTick((t) => t + 1) }}
          onConsumoMovido={consumoMovido}
          onAgregarPedido={() => {
            setOrigen('mesaOcupada')
            setVista('pedido')
          }}
          onCerrarCuenta={() => setVista('cuenta')}
        />
      )}

      {vista === 'cuenta' && mesa && (
        <CerrarCuenta
          key={`cuenta-${mesa.id}-${tick}`}
          mesa={mesa}
          onVolver={() => setVista('mesaOcupada')}
          onCuentaCerrada={cuentaCerrada}
        />
      )}
    </div>
  )
}
