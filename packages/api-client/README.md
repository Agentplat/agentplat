# @agentplat/api-client

Cliente TypeScript para la API de Agentic Platform.

## Instalación

```bash
pnpm add @agentplat/api-client
```

## Uso Básico

```typescript
import { ApiClient } from '@agentplat/api-client';

// Crear instancia del cliente
const client = new ApiClient('https://api.agentplat.com');

// Establecer token de autenticación
client.setToken('your-jwt-token');

// Usar el cliente
const agents = await client.listAgents({ page: 1, limit: 20 });
console.log(agents.data);
```

## Ejemplos

### Crear un Agente

```typescript
const agent = await client.createAgent({
  name: 'Asistente de Ventas',
  description: 'Agente especializado en atención al cliente',
  platform: 'openai',
  modelName: 'gpt-4',
  config: {
    temperature: 0.7,
    maxTokens: 1000
  },
  capabilities: {
    chat: true,
    productRecommendation: true
  },
  memoryEnabled: true,
  status: 'active'
});
```

### Listar Productos con Filtros

```typescript
const products = await client.listProducts({
  merchantId: 'merchant-id',
  status: 'active',
  page: 1,
  limit: 20
});

console.log(`Total: ${products.pagination?.total}`);
console.log(`Páginas: ${products.pagination?.totalPages}`);
```

### Crear una Orden

```typescript
const order = await client.createOrder({
  merchantId: 'merchant-id',
  customerId: 'customer-id',
  totalAmount: 99.99,
  currency: 'USD',
  items: [
    {
      productId: 'product-id',
      quantity: 2,
      unitPrice: 49.99
    }
  ]
});
```

### Manejo de Errores

```typescript
try {
  const agent = await client.getAgent('agent-id');
} catch (error) {
  if (error.message.includes('404')) {
    console.error('Agente no encontrado');
  } else if (error.message.includes('401')) {
    console.error('Token inválido o expirado');
  } else {
    console.error('Error:', error.message);
  }
}
```

### Ejecuciones y Logs

```typescript
// Crear ejecución
const execution = await client.createExecution({
  agentId: 'agent-id',
  input: {
    message: '¿Qué productos tienes?'
  },
  status: 'running'
});

// Agregar logs
await client.addExecutionLog(execution.id, {
  step: 1,
  type: 'tool_call',
  payload: {
    tool: 'search_products',
    parameters: { query: 'productos' }
  }
});

// Obtener logs
const { logs } = await client.getExecutionLogs(execution.id);
```

## API Completa

### Agents (5 métodos)
- `listAgents(options?)` - Listar agentes
- `getAgent(id)` - Obtener agente
- `createAgent(input)` - Crear agente
- `updateAgent(id, input)` - Actualizar agente
- `deleteAgent(id)` - Eliminar agente

### Merchants (5 métodos)
- `listMerchants(options?)` - Listar comerciantes
- `getMerchant(id)` - Obtener comerciante
- `createMerchant(input)` - Crear comerciante
- `updateMerchant(id, input)` - Actualizar comerciante
- `deleteMerchant(id)` - Eliminar comerciante

### Products (5 métodos)
- `listProducts(options?)` - Listar productos
- `getProduct(id)` - Obtener producto
- `createProduct(input)` - Crear producto
- `updateProduct(id, input)` - Actualizar producto
- `deleteProduct(id)` - Eliminar producto

### Customers (5 métodos)
- `listCustomers(options?)` - Listar clientes
- `getCustomer(id)` - Obtener cliente
- `createCustomer(input)` - Crear cliente
- `updateCustomer(id, input)` - Actualizar cliente
- `deleteCustomer(id)` - Eliminar cliente

### Orders (5 métodos)
- `listOrders(options?)` - Listar órdenes
- `getOrder(id)` - Obtener orden
- `createOrder(input)` - Crear orden
- `updateOrder(id, input)` - Actualizar orden
- `deleteOrder(id)` - Eliminar orden

### Payments (5 métodos)
- `listPayments(options?)` - Listar pagos
- `getPayment(id)` - Obtener pago
- `createPayment(input)` - Crear pago
- `updatePayment(id, input)` - Actualizar pago
- `deletePayment(id)` - Eliminar pago

### Executions (7 métodos)
- `listExecutions(options?)` - Listar ejecuciones
- `getExecution(id)` - Obtener ejecución
- `createExecution(input)` - Crear ejecución
- `updateExecution(id, input)` - Actualizar ejecución
- `deleteExecution(id)` - Eliminar ejecución
- `getExecutionLogs(executionId)` - Obtener logs
- `addExecutionLog(executionId, input)` - Agregar log

### Integrations (5 métodos)
- `listIntegrations(options?)` - Listar integraciones
- `getIntegration(id)` - Obtener integración
- `createIntegration(input)` - Crear integración
- `updateIntegration(id, input)` - Actualizar integración
- `deleteIntegration(id)` - Eliminar integración

### Workflows (5 métodos)
- `listWorkflows(options?)` - Listar workflows
- `getWorkflow(id)` - Obtener workflow
- `createWorkflow(input)` - Crear workflow
- `updateWorkflow(id, input)` - Actualizar workflow
- `deleteWorkflow(id)` - Eliminar workflow

### Knowledge Bases (9 métodos)
- `listKnowledgeBases(options?)` - Listar bases de conocimiento
- `getKnowledgeBase(id)` - Obtener base de conocimiento
- `createKnowledgeBase(input)` - Crear base de conocimiento
- `updateKnowledgeBase(id, input)` - Actualizar base de conocimiento
- `deleteKnowledgeBase(id)` - Eliminar base de conocimiento
- `listDocuments(kbId, options?)` - Listar documentos
- `getDocument(id)` - Obtener documento
- `createDocument(kbId, input)` - Crear documento
- `deleteDocument(id)` - Eliminar documento

### Goals (5 métodos)
- `listGoals(options?)` - Listar objetivos
- `getGoal(id)` - Obtener objetivo
- `createGoal(input)` - Crear objetivo
- `updateGoal(id, input)` - Actualizar objetivo
- `deleteGoal(id)` - Eliminar objetivo

### Plans (5 métodos)
- `listPlans(options?)` - Listar planes
- `getPlan(id)` - Obtener plan
- `createPlan(input)` - Crear plan
- `updatePlan(id, input)` - Actualizar plan
- `deletePlan(id)` - Eliminar plan

### Tasks (5 métodos)
- `listTasks(options?)` - Listar tareas
- `getTask(id)` - Obtener tarea
- `createTask(input)` - Crear tarea
- `updateTask(id, input)` - Actualizar tarea
- `deleteTask(id)` - Eliminar tarea

### Simulations (5 métodos)
- `listSimulations(options?)` - Listar simulaciones
- `getSimulation(id)` - Obtener simulación
- `createSimulation(input)` - Crear simulación
- `updateSimulation(id, input)` - Actualizar simulación
- `deleteSimulation(id)` - Eliminar simulación

### Customer Interactions (5 métodos)
- `listCustomerInteractions(options?)` - Listar interacciones
- `getCustomerInteraction(id)` - Obtener interacción
- `createCustomerInteraction(input)` - Crear interacción
- `updateCustomerInteraction(id, input)` - Actualizar interacción
- `deleteCustomerInteraction(id)` - Eliminar interacción

### Automation Rules (5 métodos)
- `listAutomationRules(options?)` - Listar reglas
- `getAutomationRule(id)` - Obtener regla
- `createAutomationRule(input)` - Crear regla
- `updateAutomationRule(id, input)` - Actualizar regla
- `deleteAutomationRule(id)` - Eliminar regla

### Inventory Movements (5 métodos)
- `listInventoryMovements(options?)` - Listar movimientos
- `getInventoryMovement(id)` - Obtener movimiento
- `createInventoryMovement(input)` - Crear movimiento
- `updateInventoryMovement(id, input)` - Actualizar movimiento
- `deleteInventoryMovement(id)` - Eliminar movimiento

### API Keys (6 métodos)
- `listAPIKeys(options?)` - Listar API keys
- `getAPIKey(id)` - Obtener API key
- `createAPIKey(input)` - Crear API key (retorna rawKey)
- `updateAPIKey(id, input)` - Actualizar API key
- `deleteAPIKey(id)` - Eliminar API key
- `revokeAPIKey(id)` - Revocar API key

### Billing Usages (6 métodos)
- `listBillingUsages(options?)` - Listar usos
- `getBillingUsage(id)` - Obtener uso
- `createBillingUsage(input)` - Crear uso
- `updateBillingUsage(id, input)` - Actualizar uso
- `deleteBillingUsage(id)` - Eliminar uso
- `getBillingStats(options?)` - Obtener estadísticas

**Total: 102 métodos implementados**

## Configuración

### Base URL

Por defecto, el cliente usa `http://localhost:3001`. Puedes cambiarlo:

```typescript
const client = new ApiClient('https://api.agentplat.com');
```

### Autenticación

El token se establece una vez y se usa en todas las peticiones:

```typescript
client.setToken('your-jwt-token');

// Para limpiar el token
client.clearToken();
```

### Abort Signal (Cancelación)

Puedes cancelar peticiones usando AbortController:

```typescript
const controller = new AbortController();

// Cancelar después de 5 segundos
setTimeout(() => controller.abort(), 5000);

try {
  const agents = await client.listAgents(
    { page: 1 },
    { signal: controller.signal }
  );
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Petición cancelada');
  }
}
```

## TypeScript

El cliente está completamente tipado. Todos los tipos están exportados:

```typescript
import type {
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  Merchant,
  Product,
  Order,
  // ... más tipos
} from '@agentplat/api-client';
```

## Desarrollo

```bash
# Instalar dependencias
pnpm install

# Compilar
pnpm build

# Modo watch
pnpm dev

# Limpiar
pnpm clean
```

## Licencia

MIT

