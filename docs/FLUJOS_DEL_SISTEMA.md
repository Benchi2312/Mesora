# Flujos del sistema — Mesora 1.0

## 0. Flujo general de Mesora

```mermaid
flowchart TD
  A[Administrador configura el restaurante] --> B[Mesero inicia sesión]
  B --> C[Selecciona mesa y crea pedido]
  C --> D[Envía comanda]
  D --> E[Cocina y Barra preparan los productos]
  E --> F[Pedido listo y entregado]
  F --> G[Mesero o cajero consulta el consumo]
  G --> H[Cobro y emisión de recibo interno]
  H --> I[Cierre de caja]
  I --> J[Auditoría y reportes]
```

Mesora conecta la toma de pedidos, la preparación en Cocina y Barra, el cobro, el cierre de caja y el análisis administrativo en un solo flujo. Las acciones sensibles quedan registradas en auditoría.

## 1. Inicio de sesión y autorización

```mermaid
flowchart TD
  A[Usuario abre Mesora] --> B[Supabase Auth valida la sesión]
  B --> C{Usuario activo y rol válido?}
  C -- No --> D[Acceso denegado o solicitud de ayuda]
  C -- Sí --> E{Restaurante puede operar?}
  E -- No --> F[Mostrar estado de suscripción]
  E -- Sí --> G[Panel asignado al rol]
  G --> H[Backend y RLS vuelven a validar cada operación]
```

## 2. Pedido y enrutamiento a estaciones

```mermaid
flowchart LR
  M[Mesero elige mesa y productos] --> P[Envía borrador con clave idempotente]
  P --> V{RPC valida sesión, mesa, productos y clave}
  V -- Rechazo --> E[Mostrar motivo; conservar borrador si procede]
  V -- Repetición igual --> R[Devolver pedido ya registrado]
  V -- Nuevo --> S[Guardar pedido, ítems y snapshot en transacción]
  S --> X{Resolver destino de cada producto}
  X -->|Bebida sin regla histórica explícita| B[Barra]
  X -->|Comida sin regla histórica explícita| C[Cocina]
  X -->|Asignación histórica explícita| H[Estación guardada]
  B --> D[Destino activo: pantalla, impresión o ambos]
  C --> D
  H --> D
  D --> K[KDS por estación, si está habilitado]
  D --> I[Salida manual o agente opcional, si está habilitado]
```

La misma clave de una comanda se conserva en reintentos; una nueva comanda legítima para esa mesa usa otra clave. Los cambios de configuración no reescriben snapshots históricos.

## 3. Preparación

```mermaid
stateDiagram-v2
  [*] --> Pendiente
  Pendiente --> EnPreparacion
  EnPreparacion --> Listo
  Listo --> Entregado
  Entregado --> [*]
```

El estado se consulta dentro de la estación correspondiente. Cocina no debe modificar el estado de Barra. Pedidos cobrados o anulados no vuelven a la cola activa; las salidas canceladas por anulación permanecen en el historial, bloqueadas para impresión.

## 4. Caja, cobro y recibo interno

```mermaid
flowchart TD
  A[Cajero autorizado abre turno] --> B[Mesero crea comandas]
  B --> C[Preparación por estaciones]
  C --> D[Consultar consumo y precuenta]
  D --> E{Persona autorizada por modalidad?}
  E -- No --> F[Backend rechaza el cobro]
  E -- Sí --> G[Registrar pagos y cerrar cuenta]
  G --> H[Emitir recibo interno]
  H --> I{Se anula con motivo y autorización requerida?}
  I -- No --> J[Cuenta permanece pagada]
  I -- Sí --> K[Conservar historial, reembolso y auditoría; bloquear recobro]
  J --> L[Cerrar turno con conteo y arqueo]
  K --> L
```

La precuenta es una vista previa. No registra pago, recibo ni cierre de mesa.

## 5. Traslado y cambio de responsable

```mermaid
sequenceDiagram
    actor Mesero
    participant UI as Mesora
    participant DB as Backend PostgreSQL

    Mesero->>UI: Elige acción, destino y motivo
    UI->>DB: Consulta estado y permisos
    DB-->>UI: Devuelve disponibilidad y datos
    UI-->>Mesero: Muestra resumen y solicita PIN
    Mesero->>UI: Confirma la operación
    UI->>DB: Ejecuta RPC transaccional
    DB-->>UI: Devuelve el resultado

    alt Operación confirmada
        UI->>DB: Relee el estado si la respuesta fue incierta
        DB-->>UI: Confirma el cambio
        UI-->>Mesero: Muestra éxito confirmado
    else Estado no verificable
        UI-->>Mesero: Solicita actualizar antes de reintentar
    end
```

## 6. Impresión y soporte

```mermaid
flowchart LR
  A[Admin configura Cocina y Barra] --> B{¿Activa impresión automática?}
  B -- No --> C[Usar pantalla KDS o impresión manual]
  B -- Sí --> D[Vincular PC Windows y asignar impresoras]
  D --> E[Agente recibe trabajo autorizado]
  E --> F[Trabajo enviado a la cola del sistema operativo]
  F --> G[Operador verifica físicamente el papel]
  H[Restaurante contacta a Soporte] --> I[Superadmin responde y revisa mensajes no leídos]
  I --> J[Actividad administrativa queda disponible en auditoría]
```

El estado “enviado a la cola” no certifica que el papel haya salido. El respaldo automático KDS a impresora permanece desactivado.
