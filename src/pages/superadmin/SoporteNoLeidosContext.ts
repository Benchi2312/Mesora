import { createContext, useContext } from 'react'

export type SoporteNoLeidosContextValue = {
  conteos: Record<string, number>
  error: string | null
  actualizar: () => Promise<void>
}

export const SoporteNoLeidosContext = createContext<SoporteNoLeidosContextValue>({
  conteos: {},
  error: null,
  actualizar: async () => undefined,
})

export function useSoporteNoLeidos(): SoporteNoLeidosContextValue {
  return useContext(SoporteNoLeidosContext)
}
