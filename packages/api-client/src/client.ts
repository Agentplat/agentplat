import type {
  ApiResponse,
  ApiError,
  RequestConfig,
  ListOptions,
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  Merchant,
  CreateMerchantInput,
  UpdateMerchantInput,
  Product,
  CreateProductInput,
  UpdateProductInput,
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  Order,
  CreateOrderInput,
  UpdateOrderInput,
  Payment,
  CreatePaymentInput,
  UpdatePaymentInput,
  AgentExecution,
  CreateExecutionInput,
  ExecutionLog,
  CreateExecutionLogInput,
  Integration,
  CreateIntegrationInput,
  UpdateIntegrationInput,
  Workflow,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  KnowledgeBase,
  CreateKnowledgeBaseInput,
  UpdateKnowledgeBaseInput,
  Document,
  CreateDocumentInput,
  Goal,
  CreateGoalInput,
  UpdateGoalInput,
  Plan,
  CreatePlanInput,
  UpdatePlanInput,
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  Simulation,
  CreateSimulationInput,
  UpdateSimulationInput,
  CustomerInteraction,
  CreateCustomerInteractionInput,
  UpdateCustomerInteractionInput,
  AutomationRule,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  InventoryMovement,
  CreateInventoryMovementInput,
  UpdateInventoryMovementInput,
  APIKey,
  CreateAPIKeyInput,
  CreateAPIKeyResponse,
  UpdateAPIKeyInput,
  BillingUsage,
  CreateBillingUsageInput,
  UpdateBillingUsageInput,
  BillingStats,
} from './types';

/**
 * Cliente API para Agentic Platform
 */
export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Establecer token de autenticación
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Limpiar token de autenticación
   */
  clearToken(): void {
    this.token = null;
  }

  /**
   * Realizar petición HTTP
   */
  private async request<T>(
    method: string,
    path: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config?.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const options: RequestInit = {
      method,
      headers,
      signal: config?.signal,
    };

    if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let error: ApiError;
      try {
        const errorData = await response.json();
        error = errorData as ApiError;
      } catch {
        error = {
          error: 'UnknownError',
          message: response.statusText,
          statusCode: response.status,
        };
      }
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const responseData = await response.json();
    return responseData as T;
  }

  /**
   * Agents
   */
  async listAgents(options?: ListOptions & { status?: string; platform?: string; search?: string }): Promise<ApiResponse<Agent[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.status) params.append('status', options.status);
    if (options?.platform) params.append('platform', options.platform);
    if (options?.search) params.append('search', options.search);

    return this.request<ApiResponse<Agent[]>>('GET', `/api/agents?${params.toString()}`);
  }

  async getAgent(id: string): Promise<Agent> {
    const response = await this.request<{ data: Agent }>('GET', `/api/agents/${id}`);
    return response.data;
  }

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    const response = await this.request<{ data: Agent }>('POST', '/api/agents', input);
    return response.data;
  }

  async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
    const response = await this.request<{ data: Agent }>('PATCH', `/api/agents/${id}`, input);
    return response.data;
  }

  async deleteAgent(id: string): Promise<void> {
    await this.request('DELETE', `/api/agents/${id}`);
  }

  /**
   * Merchants
   */
  async listMerchants(options?: ListOptions & { status?: string; search?: string }): Promise<ApiResponse<Merchant[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.status) params.append('status', options.status);
    if (options?.search) params.append('search', options.search);

    return this.request<ApiResponse<Merchant[]>>('GET', `/api/merchants?${params.toString()}`);
  }

  async getMerchant(id: string): Promise<Merchant> {
    const response = await this.request<{ data: Merchant }>('GET', `/api/merchants/${id}`);
    return response.data;
  }

  async createMerchant(input: CreateMerchantInput): Promise<Merchant> {
    const response = await this.request<{ data: Merchant }>('POST', '/api/merchants', input);
    return response.data;
  }

  async updateMerchant(id: string, input: UpdateMerchantInput): Promise<Merchant> {
    const response = await this.request<{ data: Merchant }>('PATCH', `/api/merchants/${id}`, input);
    return response.data;
  }

  async deleteMerchant(id: string): Promise<void> {
    await this.request('DELETE', `/api/merchants/${id}`);
  }

  /**
   * Products
   */
  async listProducts(options?: ListOptions & { merchantId?: string; status?: string; search?: string }): Promise<ApiResponse<Product[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.status) params.append('status', options.status);
    if (options?.search) params.append('search', options.search);

    return this.request<ApiResponse<Product[]>>('GET', `/api/products?${params.toString()}`);
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.request<{ data: Product }>('GET', `/api/products/${id}`);
    return response.data;
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    const response = await this.request<{ data: Product }>('POST', '/api/products', input);
    return response.data;
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const response = await this.request<{ data: Product }>('PATCH', `/api/products/${id}`, input);
    return response.data;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.request('DELETE', `/api/products/${id}`);
  }

  /**
   * Customers
   */
  async listCustomers(options?: ListOptions & { search?: string }): Promise<ApiResponse<Customer[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.search) params.append('search', options.search);

    return this.request<ApiResponse<Customer[]>>('GET', `/api/customers?${params.toString()}`);
  }

  async getCustomer(id: string): Promise<Customer> {
    const response = await this.request<{ data: Customer }>('GET', `/api/customers/${id}`);
    return response.data;
  }

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const response = await this.request<{ data: Customer }>('POST', '/api/customers', input);
    return response.data;
  }

  async updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer> {
    const response = await this.request<{ data: Customer }>('PATCH', `/api/customers/${id}`, input);
    return response.data;
  }

  async deleteCustomer(id: string): Promise<void> {
    await this.request('DELETE', `/api/customers/${id}`);
  }

  /**
   * Orders
   */
  async listOrders(options?: ListOptions & { merchantId?: string; customerId?: string; status?: string }): Promise<ApiResponse<Order[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.customerId) params.append('customerId', options.customerId);
    if (options?.status) params.append('status', options.status);

    return this.request<ApiResponse<Order[]>>('GET', `/api/orders?${params.toString()}`);
  }

  async getOrder(id: string): Promise<Order> {
    const response = await this.request<{ data: Order }>('GET', `/api/orders/${id}`);
    return response.data;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const response = await this.request<{ data: Order }>('POST', '/api/orders', input);
    return response.data;
  }

  async updateOrder(id: string, input: UpdateOrderInput): Promise<Order> {
    const response = await this.request<{ data: Order }>('PATCH', `/api/orders/${id}`, input);
    return response.data;
  }

  async deleteOrder(id: string): Promise<void> {
    await this.request('DELETE', `/api/orders/${id}`);
  }

  /**
   * Payments
   */
  async listPayments(options?: ListOptions & { orderId?: string; status?: string; provider?: string }): Promise<ApiResponse<Payment[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.orderId) params.append('orderId', options.orderId);
    if (options?.status) params.append('status', options.status);
    if (options?.provider) params.append('provider', options.provider);

    return this.request<ApiResponse<Payment[]>>('GET', `/api/payments?${params.toString()}`);
  }

  async getPayment(id: string): Promise<Payment> {
    const response = await this.request<{ data: Payment }>('GET', `/api/payments/${id}`);
    return response.data;
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const response = await this.request<{ data: Payment }>('POST', '/api/payments', input);
    return response.data;
  }

  async updatePayment(id: string, input: UpdatePaymentInput): Promise<Payment> {
    const response = await this.request<{ data: Payment }>('PATCH', `/api/payments/${id}`, input);
    return response.data;
  }

  async deletePayment(id: string): Promise<void> {
    await this.request('DELETE', `/api/payments/${id}`);
  }

  /**
   * Executions
   */
  async listExecutions(options?: ListOptions & { agentId?: string; status?: string }): Promise<ApiResponse<AgentExecution[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.agentId) params.append('agentId', options.agentId);
    if (options?.status) params.append('status', options.status);

    return this.request<ApiResponse<AgentExecution[]>>('GET', `/api/executions?${params.toString()}`);
  }

  async getExecution(id: string): Promise<AgentExecution> {
    const response = await this.request<{ data: AgentExecution }>('GET', `/api/executions/${id}`);
    return response.data;
  }

  async createExecution(input: CreateExecutionInput): Promise<AgentExecution> {
    const response = await this.request<{ data: AgentExecution }>('POST', '/api/executions', input);
    return response.data;
  }

  async updateExecution(id: string, input: Partial<CreateExecutionInput>): Promise<AgentExecution> {
    const response = await this.request<{ data: AgentExecution }>('PATCH', `/api/executions/${id}`, input);
    return response.data;
  }

  async deleteExecution(id: string): Promise<void> {
    await this.request('DELETE', `/api/executions/${id}`);
  }

  /**
   * Execution Logs
   */
  async getExecutionLogs(executionId: string): Promise<{ logs: ExecutionLog[] }> {
    return this.request<{ logs: ExecutionLog[] }>('GET', `/api/executions/${executionId}/logs`);
  }

  async addExecutionLog(executionId: string, input: CreateExecutionLogInput): Promise<ExecutionLog> {
    const response = await this.request<{ data: ExecutionLog }>('POST', `/api/executions/${executionId}/logs`, input);
    return response.data;
  }

  /**
   * Integrations
   */
  async listIntegrations(options?: ListOptions & { merchantId?: string; status?: string; provider?: string; type?: string }): Promise<ApiResponse<Integration[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.status) params.append('status', options.status);
    if (options?.provider) params.append('provider', options.provider);
    if (options?.type) params.append('type', options.type);

    return this.request<ApiResponse<Integration[]>>('GET', `/api/integrations?${params.toString()}`);
  }

  async getIntegration(id: string): Promise<Integration> {
    const response = await this.request<{ data: Integration }>('GET', `/api/integrations/${id}`);
    return response.data;
  }

  async createIntegration(input: CreateIntegrationInput): Promise<Integration> {
    const response = await this.request<{ data: Integration }>('POST', '/api/integrations', input);
    return response.data;
  }

  async updateIntegration(id: string, input: UpdateIntegrationInput): Promise<Integration> {
    const response = await this.request<{ data: Integration }>('PATCH', `/api/integrations/${id}`, input);
    return response.data;
  }

  async deleteIntegration(id: string): Promise<void> {
    await this.request('DELETE', `/api/integrations/${id}`);
  }

  /**
   * Workflows
   */
  async listWorkflows(options?: ListOptions & { merchantId?: string; enabled?: boolean }): Promise<ApiResponse<Workflow[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.enabled !== undefined) params.append('enabled', options.enabled.toString());

    return this.request<ApiResponse<Workflow[]>>('GET', `/api/workflows?${params.toString()}`);
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const response = await this.request<{ data: Workflow }>('GET', `/api/workflows/${id}`);
    return response.data;
  }

  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const response = await this.request<{ data: Workflow }>('POST', '/api/workflows', input);
    return response.data;
  }

  async updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
    const response = await this.request<{ data: Workflow }>('PATCH', `/api/workflows/${id}`, input);
    return response.data;
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request('DELETE', `/api/workflows/${id}`);
  }

  /**
   * Knowledge Bases
   */
  async listKnowledgeBases(options?: ListOptions & { merchantId?: string; type?: string }): Promise<ApiResponse<KnowledgeBase[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.type) params.append('type', options.type);

    return this.request<ApiResponse<KnowledgeBase[]>>('GET', `/api/knowledge-bases?${params.toString()}`);
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBase> {
    const response = await this.request<{ data: KnowledgeBase }>('GET', `/api/knowledge-bases/${id}`);
    return response.data;
  }

  async createKnowledgeBase(input: CreateKnowledgeBaseInput): Promise<KnowledgeBase> {
    const response = await this.request<{ data: KnowledgeBase }>('POST', '/api/knowledge-bases', input);
    return response.data;
  }

  async updateKnowledgeBase(id: string, input: UpdateKnowledgeBaseInput): Promise<KnowledgeBase> {
    const response = await this.request<{ data: KnowledgeBase }>('PATCH', `/api/knowledge-bases/${id}`, input);
    return response.data;
  }

  async deleteKnowledgeBase(id: string): Promise<void> {
    await this.request('DELETE', `/api/knowledge-bases/${id}`);
  }

  /**
   * Documents
   */
  async listDocuments(kbId: string, options?: ListOptions): Promise<ApiResponse<Document[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    return this.request<ApiResponse<Document[]>>('GET', `/api/knowledge-bases/${kbId}/documents?${params.toString()}`);
  }

  async getDocument(id: string): Promise<Document> {
    const response = await this.request<{ data: Document }>('GET', `/api/documents/${id}`);
    return response.data;
  }

  async createDocument(kbId: string, input: CreateDocumentInput): Promise<Document> {
    const response = await this.request<{ data: Document }>('POST', `/api/knowledge-bases/${kbId}/documents`, input);
    return response.data;
  }

  async deleteDocument(id: string): Promise<void> {
    await this.request('DELETE', `/api/documents/${id}`);
  }

  /**
   * Goals
   */
  async listGoals(options?: ListOptions & { agentId?: string; status?: string }): Promise<ApiResponse<Goal[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.agentId) params.append('agentId', options.agentId);
    if (options?.status) params.append('status', options.status);

    return this.request<ApiResponse<Goal[]>>('GET', `/api/goals?${params.toString()}`);
  }

  async getGoal(id: string): Promise<Goal> {
    const response = await this.request<{ data: Goal }>('GET', `/api/goals/${id}`);
    return response.data;
  }

  async createGoal(input: CreateGoalInput): Promise<Goal> {
    const response = await this.request<{ data: Goal }>('POST', '/api/goals', input);
    return response.data;
  }

  async updateGoal(id: string, input: UpdateGoalInput): Promise<Goal> {
    const response = await this.request<{ data: Goal }>('PATCH', `/api/goals/${id}`, input);
    return response.data;
  }

  async deleteGoal(id: string): Promise<void> {
    await this.request('DELETE', `/api/goals/${id}`);
  }

  /**
   * Plans
   */
  async listPlans(options?: ListOptions & { goalId?: string; status?: string }): Promise<ApiResponse<Plan[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.goalId) params.append('goalId', options.goalId);
    if (options?.status) params.append('status', options.status);

    return this.request<ApiResponse<Plan[]>>('GET', `/api/plans?${params.toString()}`);
  }

  async getPlan(id: string): Promise<Plan> {
    const response = await this.request<{ data: Plan }>('GET', `/api/plans/${id}`);
    return response.data;
  }

  async createPlan(input: CreatePlanInput): Promise<Plan> {
    const response = await this.request<{ data: Plan }>('POST', '/api/plans', input);
    return response.data;
  }

  async updatePlan(id: string, input: UpdatePlanInput): Promise<Plan> {
    const response = await this.request<{ data: Plan }>('PATCH', `/api/plans/${id}`, input);
    return response.data;
  }

  async deletePlan(id: string): Promise<void> {
    await this.request('DELETE', `/api/plans/${id}`);
  }

  /**
   * Tasks
   */
  async listTasks(options?: ListOptions & { planId?: string; status?: string }): Promise<ApiResponse<Task[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.planId) params.append('planId', options.planId);
    if (options?.status) params.append('status', options.status);

    return this.request<ApiResponse<Task[]>>('GET', `/api/tasks?${params.toString()}`);
  }

  async getTask(id: string): Promise<Task> {
    const response = await this.request<{ data: Task }>('GET', `/api/tasks/${id}`);
    return response.data;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const response = await this.request<{ data: Task }>('POST', '/api/tasks', input);
    return response.data;
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    const response = await this.request<{ data: Task }>('PATCH', `/api/tasks/${id}`, input);
    return response.data;
  }

  async deleteTask(id: string): Promise<void> {
    await this.request('DELETE', `/api/tasks/${id}`);
  }

  /**
   * Simulations
   */
  async listSimulations(options?: ListOptions & { agentId?: string }): Promise<ApiResponse<Simulation[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.agentId) params.append('agentId', options.agentId);

    return this.request<ApiResponse<Simulation[]>>('GET', `/api/simulations?${params.toString()}`);
  }

  async getSimulation(id: string): Promise<Simulation> {
    const response = await this.request<{ data: Simulation }>('GET', `/api/simulations/${id}`);
    return response.data;
  }

  async createSimulation(input: CreateSimulationInput): Promise<Simulation> {
    const response = await this.request<{ data: Simulation }>('POST', '/api/simulations', input);
    return response.data;
  }

  async updateSimulation(id: string, input: UpdateSimulationInput): Promise<Simulation> {
    const response = await this.request<{ data: Simulation }>('PATCH', `/api/simulations/${id}`, input);
    return response.data;
  }

  async deleteSimulation(id: string): Promise<void> {
    await this.request('DELETE', `/api/simulations/${id}`);
  }

  /**
   * Customer Interactions
   */
  async listCustomerInteractions(options?: ListOptions & { customerId?: string; agentId?: string; channel?: string }): Promise<ApiResponse<CustomerInteraction[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.customerId) params.append('customerId', options.customerId);
    if (options?.agentId) params.append('agentId', options.agentId);
    if (options?.channel) params.append('channel', options.channel);

    return this.request<ApiResponse<CustomerInteraction[]>>('GET', `/api/customer-interactions?${params.toString()}`);
  }

  async getCustomerInteraction(id: string): Promise<CustomerInteraction> {
    const response = await this.request<{ data: CustomerInteraction }>('GET', `/api/customer-interactions/${id}`);
    return response.data;
  }

  async createCustomerInteraction(input: CreateCustomerInteractionInput): Promise<CustomerInteraction> {
    const response = await this.request<{ data: CustomerInteraction }>('POST', '/api/customer-interactions', input);
    return response.data;
  }

  async updateCustomerInteraction(id: string, input: UpdateCustomerInteractionInput): Promise<CustomerInteraction> {
    const response = await this.request<{ data: CustomerInteraction }>('PATCH', `/api/customer-interactions/${id}`, input);
    return response.data;
  }

  async deleteCustomerInteraction(id: string): Promise<void> {
    await this.request('DELETE', `/api/customer-interactions/${id}`);
  }

  /**
   * Automation Rules
   */
  async listAutomationRules(options?: ListOptions & { merchantId?: string; enabled?: boolean; event?: string }): Promise<ApiResponse<AutomationRule[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.enabled !== undefined) params.append('enabled', options.enabled.toString());
    if (options?.event) params.append('event', options.event);

    return this.request<ApiResponse<AutomationRule[]>>('GET', `/api/automation-rules?${params.toString()}`);
  }

  async getAutomationRule(id: string): Promise<AutomationRule> {
    const response = await this.request<{ data: AutomationRule }>('GET', `/api/automation-rules/${id}`);
    return response.data;
  }

  async createAutomationRule(input: CreateAutomationRuleInput): Promise<AutomationRule> {
    const response = await this.request<{ data: AutomationRule }>('POST', '/api/automation-rules', input);
    return response.data;
  }

  async updateAutomationRule(id: string, input: UpdateAutomationRuleInput): Promise<AutomationRule> {
    const response = await this.request<{ data: AutomationRule }>('PATCH', `/api/automation-rules/${id}`, input);
    return response.data;
  }

  async deleteAutomationRule(id: string): Promise<void> {
    await this.request('DELETE', `/api/automation-rules/${id}`);
  }

  /**
   * Inventory Movements
   */
  async listInventoryMovements(options?: ListOptions & { productId?: string; type?: string }): Promise<ApiResponse<InventoryMovement[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.productId) params.append('productId', options.productId);
    if (options?.type) params.append('type', options.type);

    return this.request<ApiResponse<InventoryMovement[]>>('GET', `/api/inventory-movements?${params.toString()}`);
  }

  async getInventoryMovement(id: string): Promise<InventoryMovement> {
    const response = await this.request<{ data: InventoryMovement }>('GET', `/api/inventory-movements/${id}`);
    return response.data;
  }

  async createInventoryMovement(input: CreateInventoryMovementInput): Promise<InventoryMovement> {
    const response = await this.request<{ data: InventoryMovement }>('POST', '/api/inventory-movements', input);
    return response.data;
  }

  async updateInventoryMovement(id: string, input: UpdateInventoryMovementInput): Promise<InventoryMovement> {
    const response = await this.request<{ data: InventoryMovement }>('PATCH', `/api/inventory-movements/${id}`, input);
    return response.data;
  }

  async deleteInventoryMovement(id: string): Promise<void> {
    await this.request('DELETE', `/api/inventory-movements/${id}`);
  }

  /**
   * API Keys
   */
  async listAPIKeys(options?: ListOptions & { merchantId?: string; revoked?: boolean }): Promise<ApiResponse<APIKey[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.revoked !== undefined) params.append('revoked', options.revoked.toString());

    return this.request<ApiResponse<APIKey[]>>('GET', `/api/api-keys?${params.toString()}`);
  }

  async getAPIKey(id: string): Promise<APIKey> {
    const response = await this.request<{ data: APIKey }>('GET', `/api/api-keys/${id}`);
    return response.data;
  }

  async createAPIKey(input: CreateAPIKeyInput): Promise<CreateAPIKeyResponse> {
    const response = await this.request<CreateAPIKeyResponse>('POST', '/api/api-keys', input);
    return response;
  }

  async updateAPIKey(id: string, input: UpdateAPIKeyInput): Promise<APIKey> {
    const response = await this.request<{ data: APIKey }>('PATCH', `/api/api-keys/${id}`, input);
    return response.data;
  }

  async deleteAPIKey(id: string): Promise<void> {
    await this.request('DELETE', `/api/api-keys/${id}`);
  }

  async revokeAPIKey(id: string): Promise<void> {
    await this.request('POST', `/api/api-keys/${id}/revoke`);
  }

  /**
   * Billing Usages
   */
  async listBillingUsages(options?: ListOptions & { agentId?: string; merchantId?: string; modelProvider?: string }): Promise<ApiResponse<BillingUsage[]>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.agentId) params.append('agentId', options.agentId);
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.modelProvider) params.append('modelProvider', options.modelProvider);

    return this.request<ApiResponse<BillingUsage[]>>('GET', `/api/billing-usages?${params.toString()}`);
  }

  async getBillingUsage(id: string): Promise<BillingUsage> {
    const response = await this.request<{ data: BillingUsage }>('GET', `/api/billing-usages/${id}`);
    return response.data;
  }

  async createBillingUsage(input: CreateBillingUsageInput): Promise<BillingUsage> {
    const response = await this.request<{ data: BillingUsage }>('POST', '/api/billing-usages', input);
    return response.data;
  }

  async updateBillingUsage(id: string, input: UpdateBillingUsageInput): Promise<BillingUsage> {
    const response = await this.request<{ data: BillingUsage }>('PATCH', `/api/billing-usages/${id}`, input);
    return response.data;
  }

  async deleteBillingUsage(id: string): Promise<void> {
    await this.request('DELETE', `/api/billing-usages/${id}`);
  }

  async getBillingStats(options?: { agentId?: string; merchantId?: string; modelProvider?: string; startDate?: Date; endDate?: Date }): Promise<BillingStats> {
    const params = new URLSearchParams();
    if (options?.agentId) params.append('agentId', options.agentId);
    if (options?.merchantId) params.append('merchantId', options.merchantId);
    if (options?.modelProvider) params.append('modelProvider', options.modelProvider);
    if (options?.startDate) params.append('startDate', options.startDate.toISOString());
    if (options?.endDate) params.append('endDate', options.endDate.toISOString());

    const response = await this.request<{ data: BillingStats }>('GET', `/api/billing-usages/stats?${params.toString()}`);
    return response.data;
  }
}

