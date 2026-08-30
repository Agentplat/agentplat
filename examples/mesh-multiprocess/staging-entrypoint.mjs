const podName = required("POD_NAME");
const ordinal = Number(podName.match(/-([0-9]+)$/u)?.[1]);
const processes = JSON.parse(required("MESH_PROCESS_SPECS"));
if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= processes.length)
  throw new TypeError("Mesh staging pod ordinal is invalid");
const processSpec = processes[ordinal];
for (const key of ["peerId", "instanceId", "keyId"]) {
  if (typeof processSpec[key] !== "string" || processSpec[key].length < 1)
    throw new TypeError(`Mesh staging process ${key} is invalid`);
}
globalThis.process.env.PEER_ID = processSpec.peerId;
globalThis.process.env.INSTANCE_ID = processSpec.instanceId;
globalThis.process.env.KEY_ID = processSpec.keyId;
globalThis.process.env.PROCESS_EPOCH = required("POD_UID");
globalThis.process.env.PEER_PORT = globalThis.process.env.PEER_PORT ?? "43101";
globalThis.process.env.MESH_LISTEN_HOST = "0.0.0.0";

await import("./peer.mjs");

function required(name) {
  const value = globalThis.process.env[name];
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}
