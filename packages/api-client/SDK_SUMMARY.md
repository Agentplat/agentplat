# Cliente SDK TypeScript - Resumen

## 📦 Package: @agentplat/api-client

Cliente TypeScript completo para interactuar con la API de Agentic Platform.

## ✨ Características

- ✅ **TypeScript completo** - Todos los tipos están definidos
- ✅ **Autenticación JWT** - Gestión automática de tokens
- ✅ **Manejo de errores** - Errores tipados y manejables
- ✅ **Paginación** - Soporte nativo para listados paginados
- ✅ **Filtros y búsqueda** - Parámetros opcionales para filtrar resultados
- ✅ **Cancelación** - Soporte para AbortSignal
- ✅ **Type-safe** - Autocompletado y validación en tiempo de compilación

## 📊 Métodos Implementados

### Agents (5 métodos)
- `listAgents(options?)` - Listar con filtros y paginación
- `getAgent(id)` - Obtener por ID
- `createAgent(input)` - Crear nuevo agente
- `updateAgent(id, input)` - Actualizar agente
- `deleteAgent(id)` - Eliminar agente

### Merchants (5 métodos)
- `listMerchants(options?)`
- `getMerchant(id)`
- `createMerchant(input)`
- `updateMerchant(id, input)`
- `deleteMerchant(id)`

### Products (5 métodos)
- `listProducts(options?)`
- `getProduct(id)`
- `createProduct(input)`
- `updateProduct(id, input)`
- `deleteProduct(id)`

### Customers (5 métodos)
- `listCustomers(options?)`
- `getCustomer(id)`
- `createCustomer(input)`
- `updateCustomer(id, input)`
- `deleteCustomer(id)`

### Orders (5 métodos)
- `listOrders(options?)`
- `getOrder(id)`
- `createOrder(input)`
- `updateOrder(id, input)`
- `deleteOrder(id)`

### Payments (5 métodos)
- `listPayments(options?)`
- `getPayment(id)`
- `createPayment(input)`
- `updatePayment(id, input)`
- `deletePayment(id)`

### Executions (7 métodos)
- `listExecutions(options?)`
- `getExecution(id)`
- `createExecution(input)`
- `updateExecution(id, input)`
- `deleteExecution(id)`
- `getExecutionLogs(executionId)`
- `addExecutionLog(executionId, input)`

**Total: 102 métodos implementados**

### Integrations (5 métodos)
- `listIntegrations`, `getIntegration`, `createIntegration`, `updateIntegration`, `deleteIntegration`

### Workflows (5 métodos)
- `listWorkflows`, `getWorkflow`, `createWorkflow`, `updateWorkflow`, `deleteWorkflow`

### Knowledge Bases (9 métodos)
- `listKnowledgeBases`, `getKnowledgeBase`, `createKnowledgeBase`, `updateKnowledgeBase`, `deleteKnowledgeBase`
- `listDocuments`, `getDocument`, `createDocument`, `deleteDocument`

### Goals (5 métodos)
- `listGoals`, `getGoal`, `createGoal`, `updateGoal`, `deleteGoal`

### Plans (5 métodos)
- `listPlans`, `getPlan`, `createPlan`, `updatePlan`, `deletePlan`

### Tasks (5 métodos)
- `listTasks`, `getTask`, `createTask`, `updateTask`, `deleteTask`

### Simulations (5 métodos)
- `listSimulations`, `getSimulation`, `createSimulation`, `updateSimulation`, `deleteSimulation`

### Customer Interactions (5 métodos)
- `listCustomerInteractions`, `getCustomerInteraction`, `createCustomerInteraction`, `updateCustomerInteraction`, `deleteCustomerInteraction`

### Automation Rules (5 métodos)
- `listAutomationRules`, `getAutomationRule`, `createAutomationRule`, `updateAutomationRule`, `deleteAutomationRule`

### Inventory Movements (5 métodos)
- `listInventoryMovements`, `getInventoryMovement`, `createInventoryMovement`, `updateInventoryMovement`, `deleteInventoryMovement`

### API Keys (6 métodos)
- `listAPIKeys`, `getAPIKey`, `createAPIKey`, `updateAPIKey`, `deleteAPIKey`, `revokeAPIKey`

### Billing Usages (6 métodos)
- `listBillingUsages`, `getBillingUsage`, `createBillingUsage`, `updateBillingUsage`, `deleteBillingUsage`, `getBillingStats`

## 🚀 Uso Rápido

```typescript
import { ApiClient } from '@agentplat/api-client';

const client = new ApiClient('https://api.agentplat.com');
client.setToken('your-jwt-token');

// Listar agentes
const agents = await client.listAgents({ page: 1, limit: 20 });

// Crear agente
const agent = await client.createAgent({
  name: 'Mi Agente',
  platform: 'openai',
  config: { temperature: 0.7 }
});
```

## 📁 Estructura

```
packages/api-client/
├── src/
│   ├── client.ts      # Cliente principal
│   ├── types.ts       # Tipos TypeScript
│   └── index.ts       # Exportaciones
├── examples/
│   └── basic-usage.ts # Ejemplo de uso
├── package.json
├── tsconfig.json
└── README.md
```

## 🔄 Próximos Pasos

Para extender el SDK con más endpoints:

1. Agregar tipos en `types.ts`
2. Agregar métodos en `client.ts`
3. Exportar en `index.ts`
4. Actualizar documentación

## 📝 Notas

- El SDK usa `fetch` nativo (requiere Node.js 18+ o polyfill)
- Todos los métodos son async/await
- Los errores se lanzan como excepciones
- La paginación es opcional pero recomendada

