import { createInterface } from 'node:readline';

import { createCollectiveStatisticalCampaignRegisteredRunnerV1 } from '../packages/mesh-sim/dist/index.js';

const runner = createCollectiveStatisticalCampaignRegisteredRunnerV1();
const renewals = new Map();
let renewalSequence = 0;
let executionActive = false;

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    rejectProtocol();
    return;
  }
  if (message?.type === 'renew-result') {
    const pending = renewals.get(message.renewalId);
    if (!pending) return rejectProtocol();
    renewals.delete(message.renewalId);
    if (message.ok === true) pending.resolve();
    else
      pending.reject(new TypeError('isolated runner lease renewal rejected'));
    return;
  }
  if (message?.type === 'close') {
    if (executionActive || renewals.size !== 0) return rejectProtocol();
    process.exit(0);
  }
  if (message?.type !== 'execute' || executionActive) {
    rejectProtocol();
    return;
  }
  executionActive = true;
  void execute(message);
});

async function execute(message) {
  try {
    const context = message.context;
    const output = await runner.executeV1({
      ...context,
      renewLeaseV1(expiresAtMs) {
        const renewalId = `${message.id}:${++renewalSequence}`;
        return new Promise((resolve, reject) => {
          renewals.set(renewalId, { resolve, reject });
          write({
            type: 'renew',
            id: message.id,
            renewalId,
            expiresAtMs,
          });
        });
      },
    });
    write({ type: 'result', id: message.id, ok: true, output });
  } catch {
    write({ type: 'result', id: message.id, ok: false });
  } finally {
    executionActive = false;
  }
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function rejectProtocol() {
  process.stderr.write('isolated runner protocol rejected\n');
  process.exit(2);
}
