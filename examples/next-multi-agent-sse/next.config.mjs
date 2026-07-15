import { fileURLToPath } from 'node:url';

/** Keep tracing inside this public repository when the example is run in a monorepo. */
export default {
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
};
