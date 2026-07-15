import { handleSessionStop } from '@agentplat/sessions/http';

import { sessionRegistry } from '../../../simulate/registry';

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  return handleSessionStop(request, sessionRegistry, sessionId);
}
