import { createSessionRegistry } from '@agentplat/sessions/http';

// Local-only example registry. Replace with a shared implementation for a
// multi-instance deployment and authenticate the stop route in real products.
export const sessionRegistry = createSessionRegistry();
