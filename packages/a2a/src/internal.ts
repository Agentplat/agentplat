import { createHash } from "node:crypto";
import { Part, Task, TaskState, Message, Role, Artifact } from "@a2a-js/sdk";
import type {
  A2APart,
  A2ATaskSnapshot,
  A2ATaskState,
  Json,
} from "./contracts.js";
export function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export function digest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export const states: Record<A2ATaskState, TaskState> = {
  submitted: 1,
  working: 2,
  completed: 3,
  failed: 4,
  canceled: 5,
  input_required: 6,
  rejected: 7,
  auth_required: 8,
};
export const terminal = (state: A2ATaskState) =>
  ["completed", "failed", "canceled", "rejected"].includes(state);
export const paused = (state: A2ATaskState) =>
  terminal(state) || state === "input_required" || state === "auth_required";
export function toPart(part: A2APart): Part {
  if (part.kind === "text")
    return {
      content: { $case: "text", value: part.text },
      mediaType: "text/plain",
      filename: "",
      metadata: undefined,
    };
  if (part.kind === "data")
    return {
      content: { $case: "data", value: part.data },
      mediaType: "application/json",
      filename: "",
      metadata: undefined,
    };
  return {
    content: { $case: "url", value: part.url },
    mediaType: part.mediaType,
    filename: "",
    metadata: undefined,
  };
}
export function fromPart(part: Part): A2APart {
  if (part.content?.$case === "text")
    return { kind: "text", text: part.content.value };
  if (part.content?.$case === "data")
    return { kind: "data", data: json(part.content.value) };
  if (part.content?.$case === "url")
    return { kind: "url", url: part.content.value, mediaType: part.mediaType };
  if (part.content?.$case === "raw")
    return {
      kind: "url",
      url: `data:${part.mediaType};base64,${Buffer.from(part.content.value).toString("base64")}`,
      mediaType: part.mediaType,
    };
  throw new Error("unsupported_part");
}
export function toTask(snapshot: A2ATaskSnapshot): Task {
  return {
    id: snapshot.taskId,
    contextId: snapshot.contextId,
    history: [],
    metadata: undefined,
    status: {
      state: states[snapshot.state],
      timestamp: undefined,
      message: snapshot.reply
        ? {
            messageId: digest(snapshot),
            role: Role.ROLE_AGENT,
            taskId: snapshot.taskId,
            contextId: snapshot.contextId,
            parts: snapshot.reply.map(toPart),
            metadata: undefined,
            extensions: [],
            referenceTaskIds: [],
          }
        : undefined,
    },
    artifacts: snapshot.artifacts.map((a) => ({
      artifactId: a.id,
      name: a.name,
      description: "",
      parts: a.parts.map(toPart),
      metadata: undefined,
      extensions: [],
    })),
  };
}
export function fromTask(task: Task): A2ATaskSnapshot {
  const state = (Object.keys(states) as A2ATaskState[]).find(
    (s) => states[s] === task.status?.state,
  );
  if (!state || !task.id || !task.contextId)
    throw new Error("invalid_remote_task");
  return {
    taskId: task.id,
    contextId: task.contextId,
    state,
    artifacts: task.artifacts.map((a) => ({
      id: a.artifactId,
      name: a.name,
      parts: a.parts.map(fromPart),
    })),
    ...(task.status?.message
      ? { reply: task.status.message.parts.map(fromPart) }
      : {}),
  };
}
