/**
 * Script de prueba para verificar que el SDK se puede importar correctamente
 */

import { ApiClient } from './src';

// Verificar que el cliente se puede instanciar
const client = new ApiClient('https://api.agentplat.com');

// Verificar métodos básicos
console.log('✅ Cliente instanciado correctamente');
console.log('✅ Métodos disponibles:');
console.log('  - listAgents:', typeof client.listAgents);
console.log('  - createAgent:', typeof client.createAgent);
console.log('  - listMerchants:', typeof client.listMerchants);
console.log('  - listProducts:', typeof client.listProducts);
console.log('  - listCustomers:', typeof client.listCustomers);
console.log('  - listOrders:', typeof client.listOrders);
console.log('  - listPayments:', typeof client.listPayments);
console.log('  - listExecutions:', typeof client.listExecutions);

// Verificar métodos de autenticación
client.setToken('test-token');
console.log('✅ setToken funciona');

client.clearToken();
console.log('✅ clearToken funciona');

console.log('\n✨ SDK importado y verificado exitosamente!');



