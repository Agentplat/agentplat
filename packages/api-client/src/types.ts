/**
 * Tipos base para el cliente API
 */

export interface ApiResponse<T> {
  data: T;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface RequestConfig {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Tipos de entidades
 */

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type?: string;
  platform: 'openai' | 'google' | 'facebook' | 'anthropic' | 'meta' | 'bedrock' | 'azure_openai' | 'mistral' | 'perplexity';
  modelName?: string;
  config: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  skills?: Record<string, unknown>;
  status: 'active' | 'inactive' | 'training' | 'error';
  memoryEnabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  type?: string;
  platform: Agent['platform'];
  modelName?: string;
  config: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  skills?: Record<string, unknown>;
  status?: Agent['status'];
  memoryEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  type?: string;
  platform?: Agent['platform'];
  modelName?: string;
  config?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  skills?: Record<string, unknown>;
  status?: Agent['status'];
  memoryEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Merchant {
  id: string;
  tenantId: string;
  name: string;
  legalId?: string;
  contactData?: Record<string, unknown>;
  plan: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMerchantInput {
  name: string;
  legalId?: string;
  contactData?: Record<string, unknown>;
  plan?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateMerchantInput {
  name?: string;
  legalId?: string;
  contactData?: Record<string, unknown>;
  plan?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface Product {
  id: string;
  tenantId: string;
  merchantId: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  images?: string[];
  stock: number;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  merchantId: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  images?: string[];
  stock?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  images?: string[];
  stock?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  preferences?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  preferences?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  preferences?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Order {
  id: string;
  tenantId: string;
  merchantId: string;
  customerId: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  totalAmount: number;
  currency: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderInput {
  merchantId: string;
  customerId: string;
  status?: Order['status'];
  totalAmount: number;
  currency?: string;
  items: OrderItem[];
  metadata?: Record<string, unknown>;
}

export interface UpdateOrderInput {
  status?: Order['status'];
  metadata?: Record<string, unknown>;
}

export interface Payment {
  id: string;
  tenantId: string;
  orderId: string;
  provider: string;
  method: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  transactionId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface CreatePaymentInput {
  orderId: string;
  provider: string;
  method: string;
  amount: number;
  currency?: string;
  status?: Payment['status'];
  transactionId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdatePaymentInput {
  status?: Payment['status'];
  transactionId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  tenantId: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface CreateExecutionInput {
  agentId: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status?: AgentExecution['status'];
  durationMs?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}

export interface ExecutionLog {
  id: string;
  executionId: string;
  step: number;
  type: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface CreateExecutionLogInput {
  step: number;
  type: string;
  payload?: Record<string, unknown>;
}

export interface Integration {
  id: string;
  tenantId: string;
  merchantId: string;
  name: string;
  provider: string;
  type: string;
  config: Record<string, unknown>;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrationInput {
  merchantId: string;
  name: string;
  provider: string;
  type: string;
  config: Record<string, unknown>;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateIntegrationInput {
  name?: string;
  config?: Record<string, unknown>;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  tenantId: string;
  merchantId: string;
  name: string;
  description?: string;
  steps: unknown[];
  trigger?: Record<string, unknown>;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowInput {
  merchantId: string;
  name: string;
  description?: string;
  steps: unknown[];
  trigger?: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  steps?: unknown[];
  trigger?: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeBase {
  id: string;
  tenantId: string;
  merchantId: string;
  name: string;
  type: string;
  source?: string;
  lastIndexed?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeBaseInput {
  merchantId: string;
  name: string;
  type: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateKnowledgeBaseInput {
  name?: string;
  type?: string;
  source?: string;
  lastIndexed?: string;
  metadata?: Record<string, unknown>;
}

export interface Document {
  id: string;
  tenantId: string;
  kbId: string;
  title: string;
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  title: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface Goal {
  id: string;
  tenantId: string;
  agentId: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  agentId: string;
  description: string;
  status?: Goal['status'];
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateGoalInput {
  description?: string;
  status?: Goal['status'];
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface Plan {
  id: string;
  tenantId: string;
  goalId: string;
  steps: unknown[];
  status: 'pending' | 'executing' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanInput {
  goalId: string;
  steps: unknown[];
  status?: Plan['status'];
  metadata?: Record<string, unknown>;
}

export interface UpdatePlanInput {
  steps?: unknown[];
  status?: Plan['status'];
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  tenantId: string;
  planId: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  toolCall?: Record<string, unknown>;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  planId: string;
  description: string;
  status?: Task['status'];
  toolCall?: Record<string, unknown>;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  description?: string;
  status?: Task['status'];
  toolCall?: Record<string, unknown>;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Simulation {
  id: string;
  tenantId: string;
  agentId: string;
  scenario: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface CreateSimulationInput {
  agentId: string;
  scenario: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateSimulationInput {
  inputs?: Record<string, unknown>;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CustomerInteraction {
  id: string;
  tenantId: string;
  customerId: string;
  agentId?: string;
  channel: string;
  input?: string;
  output?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  metadata?: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface CreateCustomerInteractionInput {
  customerId: string;
  agentId?: string;
  channel: string;
  input?: string;
  output?: string;
  sentiment?: CustomerInteraction['sentiment'];
  metadata?: Record<string, unknown>;
}

export interface UpdateCustomerInteractionInput {
  input?: string;
  output?: string;
  sentiment?: CustomerInteraction['sentiment'];
  metadata?: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  tenantId: string;
  merchantId: string;
  event: string;
  condition?: Record<string, unknown>;
  action: Record<string, unknown>;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationRuleInput {
  merchantId: string;
  event: string;
  condition?: Record<string, unknown>;
  action: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateAutomationRuleInput {
  event?: string;
  condition?: Record<string, unknown>;
  action?: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface InventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  type: 'in' | 'out' | 'adjustment' | 'return';
  quantity: number;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface CreateInventoryMovementInput {
  productId: string;
  type: InventoryMovement['type'];
  quantity: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateInventoryMovementInput {
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface APIKey {
  id: string;
  tenantId: string;
  merchantId: string;
  key: string;
  scopes?: unknown[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  revokedAt?: string;
}

export interface CreateAPIKeyInput {
  merchantId: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateAPIKeyResponse extends APIKey {
  rawKey: string; // Solo en creación
}

export interface UpdateAPIKeyInput {
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface BillingUsage {
  id: string;
  tenantId: string;
  agentId?: string;
  merchantId?: string;
  modelProvider: string;
  modelName: string;
  tokensUsed: number;
  cost: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface CreateBillingUsageInput {
  agentId?: string;
  merchantId?: string;
  modelProvider: string;
  modelName: string;
  tokensUsed: number;
  cost: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateBillingUsageInput {
  tokensUsed?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}

export interface BillingStats {
  totalTokens: number;
  totalCost: number;
  totalRecords: number;
}

export interface ListOptions {
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

