/**
 * Ejemplo básico de uso del cliente API
 */

import { ApiClient } from '../src';

async function main() {
  // Crear instancia del cliente
  const client = new ApiClient('https://api.agentplat.com');

  // Establecer token de autenticación
  // En producción, obtén el token de tu sistema de autenticación
  client.setToken('your-jwt-token-here');

  try {
    // 1. Listar agentes
    console.log('📋 Listando agentes...');
    const agentsResponse = await client.listAgents({
      page: 1,
      limit: 10,
      status: 'active',
    });
    console.log(`Total agentes: ${agentsResponse.pagination?.total}`);
    console.log(`Agentes encontrados: ${agentsResponse.data.length}`);

    // 2. Crear un agente
    console.log('\n🤖 Creando agente...');
    const newAgent = await client.createAgent({
      name: 'Asistente de Ventas',
      description: 'Agente especializado en atención al cliente',
      platform: 'openai',
      modelName: 'gpt-4',
      config: {
        temperature: 0.7,
        maxTokens: 1000,
      },
      capabilities: {
        chat: true,
        productRecommendation: true,
      },
      memoryEnabled: true,
      status: 'active',
    });
    console.log(`Agente creado: ${newAgent.id}`);

    // 3. Crear un merchant
    console.log('\n🏪 Creando merchant...');
    const merchant = await client.createMerchant({
      name: 'Tienda Ejemplo',
      legalId: '123456789',
      contactData: {
        email: 'contacto@tienda.com',
        phone: '+1234567890',
      },
      plan: 'premium',
      status: 'active',
    });
    console.log(`Merchant creado: ${merchant.id}`);

    // 4. Crear un producto
    console.log('\n📦 Creando producto...');
    const product = await client.createProduct({
      merchantId: merchant.id,
      name: 'Producto Ejemplo',
      description: 'Descripción del producto',
      price: 99.99,
      currency: 'USD',
      stock: 100,
      status: 'active',
    });
    console.log(`Producto creado: ${product.id}`);

    // 5. Crear un cliente
    console.log('\n👤 Creando cliente...');
    const customer = await client.createCustomer({
      name: 'Juan Pérez',
      email: 'juan@example.com',
      phone: '+1234567890',
    });
    console.log(`Cliente creado: ${customer.id}`);

    // 6. Crear una orden
    console.log('\n🛒 Creando orden...');
    const order = await client.createOrder({
      merchantId: merchant.id,
      customerId: customer.id,
      totalAmount: 99.99,
      currency: 'USD',
      items: [
        {
          productId: product.id,
          quantity: 1,
          unitPrice: 99.99,
        },
      ],
    });
    console.log(`Orden creada: ${order.id}`);

    // 7. Crear un pago
    console.log('\n💳 Creando pago...');
    const payment = await client.createPayment({
      orderId: order.id,
      provider: 'stripe',
      method: 'credit_card',
      amount: 99.99,
      currency: 'USD',
      status: 'pending',
    });
    console.log(`Pago creado: ${payment.id}`);

    // 8. Crear una ejecución de agente
    console.log('\n⚙️ Creando ejecución...');
    const execution = await client.createExecution({
      agentId: newAgent.id,
      input: {
        message: '¿Qué productos tienes disponibles?',
        customerId: customer.id,
      },
      status: 'running',
    });
    console.log(`Ejecución creada: ${execution.id}`);

    // 9. Agregar logs a la ejecución
    console.log('\n📝 Agregando logs...');
    await client.addExecutionLog(execution.id, {
      step: 1,
      type: 'tool_call',
      payload: {
        tool: 'search_products',
        parameters: {
          query: 'disponibles',
        },
      },
    });

    await client.addExecutionLog(execution.id, {
      step: 2,
      type: 'decision',
      payload: {
        action: 'return_results',
        productsFound: 5,
      },
    });

    // 10. Finalizar ejecución
    console.log('\n✅ Finalizando ejecución...');
    await client.updateExecution(execution.id, {
      status: 'completed',
      output: {
        response: 'Tenemos 5 productos disponibles...',
        products: [],
      },
      durationMs: 1250,
      cost: 0.002,
    });

    // 11. Obtener logs
    console.log('\n📋 Obteniendo logs...');
    const { logs } = await client.getExecutionLogs(execution.id);
    console.log(`Logs encontrados: ${logs.length}`);

    console.log('\n✨ Ejemplo completado exitosamente!');
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Mensaje:', error.message);
    }
  }
}

// Ejecutar ejemplo
if (require.main === module) {
  main().catch(console.error);
}

export { main };



