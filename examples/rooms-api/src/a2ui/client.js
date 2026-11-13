const form = document.querySelector("form");
const output = document.querySelector("main");
const status = document.querySelector("[role=status]");
const decisionStatus = document.querySelector("#decision-status");
let generation = 0;
let timer;
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const epoch = ++generation;
  clearTimeout(timer);
  const drafts = new Map(
    [...output.querySelectorAll("section")].map((section) => [
      section.dataset.surfaceId,
      section.querySelector("textarea").value,
    ]),
  );
  output.replaceChildren();
  delete output.dataset.cursor;
  status.textContent = "Connecting…";
  decisionStatus.textContent = "";
  const fields = new FormData(form);
  const endpoint = `/experimental/a2ui/rooms/${encodeURIComponent(fields.get("room"))}`;
  const headers = {
    Authorization: `Bearer ${fields.get("token")}`,
    "Content-Type": "application/json",
  };
  let requestSequence = 0;
  async function refresh() {
    const sequence = ++requestSequence;
    try {
      const response = await fetch(endpoint, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (epoch !== generation || sequence !== requestSequence) return;
      const fragment = document.createDocumentFragment();
      for (const message of body.data.surfaces) {
        const surface = message.createSurface;
        if (
          message.version !== "1.0" ||
          surface.catalogId !== "agentplat:experimental:proposal-review:v1"
        )
          throw new Error("Unsupported catalog");
        const section = document.createElement("section");
        section.dataset.surfaceId = surface.surfaceId;
        const comment = document.createElement("textarea");
        comment.maxLength = 4000;
        comment.value = drafts.get(surface.surfaceId) ?? "";
        comment.addEventListener("input", () =>
          drafts.set(surface.surfaceId, comment.value),
        );
        comment.placeholder = "Review comment / requested changes";
        comment.setAttribute("aria-label", comment.placeholder);
        const root = surface.components.find((c) => c.id === "root");
        for (const id of root.children) {
          const component = surface.components.find((c) => c.id === id);
          if (component.component === "Text") {
            const text = document.createElement("pre");
            text.textContent = component.text;
            section.append(text);
          } else if (
            component.component === "Decision" &&
            ["approve", "reject", "requestRevision"].includes(
              component.decision,
            )
          ) {
            const button = document.createElement("button");
            button.textContent = component.label;
            button.onclick = async () => {
              if (epoch !== generation) return;
              const buttons = section.querySelectorAll("button");
              buttons.forEach((b) => {
                b.disabled = true;
              });
              comment.disabled = true;
              try {
                const result = await fetch(endpoint, {
                  method: "POST",
                  headers,
                  signal: AbortSignal.timeout(10000),
                  body: JSON.stringify({
                    version: "1.0",
                    action: {
                      name: component.decision,
                      sourceComponentId: component.id,
                      surfaceId: surface.surfaceId,
                      timestamp: new Date().toISOString(),
                      context: { comment: comment.value },
                    },
                  }),
                });
                const body = await result.json();
                if (epoch !== generation) return;
                if (!result.ok) throw new Error(body.error);
                decisionStatus.textContent = `Recorded decision: ${body.data.status} (artifact version ${body.data.targetVersion}).`;
                await refresh();
              } catch (error) {
                if (epoch === generation) status.textContent = error.message;
              } finally {
                buttons.forEach((b) => {
                  b.disabled = false;
                });
                comment.disabled = false;
              }
            };
            section.append(button);
          } else throw new Error("Unsupported component");
        }
        section.append(comment);
        fragment.append(section);
      }
      // Keep an in-progress comment intact when nothing has changed.
      if (output.dataset.cursor !== body.data.cursor) {
        output.replaceChildren(fragment);
        output.dataset.cursor = body.data.cursor;
      }
      status.textContent = body.data.surfaces.length
        ? "Connected. Only pending approvals for current versions are shown."
        : "Connected. No pending approvals for current versions.";
    } catch (error) {
      if (epoch === generation && sequence === requestSequence)
        status.textContent = `Disconnected / error: ${error.message}. Retrying…`;
    }
  }
  async function poll() {
    await refresh();
    if (epoch === generation) timer = setTimeout(poll, 2000);
  }
  await poll();
});
