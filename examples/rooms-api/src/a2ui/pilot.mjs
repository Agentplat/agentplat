import { createHash, timingSafeEqual } from "node:crypto";

export const catalogId = "agentplat:experimental:proposal-review:v1";
const statuses = {
  approve: "approved",
  reject: "rejected",
  requestRevision: "needs_revision",
};
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const surfaceId = (approval) =>
  `proposal_${digest([approval.roomId, approval.id, approval.targetVersion])}`;

// A deliberately restricted, custom A2UI catalog. No executable content or RPC.
export function validateSurface(message) {
  if (
    message?.version !== "1.0" ||
    Object.keys(message).sort().join() !== "createSurface,version"
  )
    fail("VALIDATION_ERROR");
  const s = message.createSurface;
  if (
    s?.catalogId !== catalogId ||
    typeof s.surfaceId !== "string" ||
    !Array.isArray(s.components) ||
    s.components.length > 20
  )
    fail("VALIDATION_ERROR");
  const ids = new Set();
  for (const c of s.components) {
    const fields = {
      Column: ["id", "component", "children"],
      Text: ["id", "component", "text"],
      Decision: ["id", "component", "label", "decision"],
    }[c.component];
    if (
      !fields ||
      Object.keys(c).some((k) => !fields.includes(k)) ||
      typeof c.id !== "string" ||
      ids.has(c.id)
    )
      fail("VALIDATION_ERROR");
    ids.add(c.id);
    if (c.component === "Text" && typeof c.text !== "string")
      fail("VALIDATION_ERROR");
    if (
      c.component === "Decision" &&
      (typeof c.label !== "string" || !Object.hasOwn(statuses, c.decision))
    )
      fail("VALIDATION_ERROR");
    if (
      c.component === "Column" &&
      (!Array.isArray(c.children) ||
        c.children.some((x) => typeof x !== "string"))
    )
      fail("VALIDATION_ERROR");
  }
  const root = s.components.find((c) => c.id === "root");
  if (
    root?.component !== "Column" ||
    s.components.some(
      (c) =>
        c.component === "Column" &&
        (c.id !== "root" ||
          c.children.some((id) => id === "root" || !ids.has(id))),
    )
  )
    fail("VALIDATION_ERROR");
  return message;
}

export function createProposalPilot({ service, tenantId, participantId }) {
  async function state(roomId) {
    const state = await service.getRoomState(tenantId, roomId);
    const human = state.participants.find((p) => p.id === participantId);
    if (
      human?.type !== "human" ||
      !human.permissions.some((p) =>
        ["*", "approve", "approval.resolve", "approve:artifact"].includes(p),
      )
    )
      fail("FORBIDDEN");
    return state;
  }
  return {
    async snapshot(roomId) {
      const room = await state(roomId);
      const surfaces = room.approvals
        .filter((a) => a.targetType === "artifact" && a.status === "requested")
        .flatMap((a) => {
          const artifact = room.artifacts.find(
            (x) => x.id === a.targetId && x.currentVersion === a.targetVersion,
          );
          if (!artifact) return [];
          const version = artifact.versions.find(
            (v) => v.version === a.targetVersion,
          );
          const components = [
            {
              id: "title",
              component: "Text",
              text: `${artifact.title} — version ${a.targetVersion}`,
            },
            {
              id: "content",
              component: "Text",
              text:
                typeof version.content === "string"
                  ? version.content
                  : JSON.stringify(version.content, null, 2),
            },
            ...Object.keys(statuses).map((decision) => ({
              id: decision,
              component: "Decision",
              label: decision,
              decision,
            })),
          ];
          return [
            validateSurface({
              version: "1.0",
              createSurface: {
                surfaceId: surfaceId(a),
                catalogId,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: components.map((c) => c.id),
                  },
                  ...components,
                ],
              },
            }),
          ];
        });
      // Full replacement snapshots deliberately avoid replaying out-of-order patches.
      return { cursor: digest(surfaces), surfaces };
    },
    async action(roomId, message) {
      if (
        message?.version !== "1.0" ||
        Object.keys(message).sort().join() !== "action,version"
      )
        fail("VALIDATION_ERROR");
      const a = message.action;
      if (
        !a ||
        Object.keys(a).some(
          (k) =>
            ![
              "name",
              "surfaceId",
              "sourceComponentId",
              "timestamp",
              "context",
            ].includes(k),
        ) ||
        !Object.hasOwn(statuses, a.name) ||
        a.sourceComponentId !== a.name ||
        !Number.isFinite(Date.parse(a.timestamp)) ||
        typeof a.context?.comment !== "string" ||
        a.context.comment.length > 4000 ||
        Object.keys(a.context).some((k) => k !== "comment")
      )
        fail("VALIDATION_ERROR");
      const room = await state(roomId);
      const approval = room.approvals.find(
        (p) => p.targetType === "artifact" && surfaceId(p) === a.surfaceId,
      );
      if (!approval) fail("NOT_FOUND");
      const artifact = room.artifacts.find((x) => x.id === approval.targetId);
      if (artifact?.currentVersion !== approval.targetVersion) fail("CONFLICT");
      const status = statuses[a.name];
      const sameDecision = (p) =>
        p?.status === status &&
        p.decidedBy === participantId &&
        p.comment === a.context.comment;
      if (sameDecision(approval)) return approval;
      try {
        return await service.resolveApproval(tenantId, approval.id, status, {
          decidedBy: participantId,
          comment: a.context.comment,
        });
      } catch (error) {
        // Durable deduplication: reconcile concurrent/retried decisions from Room state.
        if (error.code === "CONFLICT") {
          const latest = await state(roomId);
          const current = latest.artifacts.find(
            (x) => x.id === approval.targetId,
          );
          const resolved = latest.approvals.find((p) => p.id === approval.id);
          if (
            current?.currentVersion === approval.targetVersion &&
            sameDecision(resolved)
          )
            return resolved;
        }
        throw error;
      }
    },
  };
}

export function mountProposalPilot(
  app,
  { service, token, tenantId, participantId, html },
) {
  if (!token || token.length < 24 || !tenantId || !participantId)
    throw new Error(
      "A2UI pilot requires a token of 24+ characters, tenant and human participant",
    );
  const pilot = createProposalPilot({ service, tenantId, participantId });
  app.get("/experimental/a2ui", (c) =>
    c.html(html, 200, {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    }),
  );
  app.all("/experimental/a2ui/rooms/:roomId", async (c) => {
    const supplied = Buffer.from(c.req.header("Authorization") ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return c.json({ error: "UNAUTHORIZED" }, 401);
    try {
      const data =
        c.req.method === "GET"
          ? await pilot.snapshot(c.req.param("roomId"))
          : c.req.method === "POST"
            ? await pilot.action(
                c.req.param("roomId"),
                JSON.parse(await c.req.text()),
              )
            : fail("VALIDATION_ERROR");
      return c.json({ data }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      const status =
        {
          VALIDATION_ERROR: 400,
          FORBIDDEN: 403,
          NOT_FOUND: 404,
          CONFLICT: 409,
        }[error.code] ?? (error instanceof SyntaxError ? 400 : 500);
      return c.json({ error: error.code ?? "INVALID_REQUEST" }, status);
    }
  });
}
