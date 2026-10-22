import {
  ArtifactService,
  artifactFormats,
  drainArtifactOutbox,
  type ArtifactFormat,
  type ArtifactReference,
  type ArtifactStore,
} from "@agentplat/artifacts";
import type { EventPublisher } from "@agentplat/events";
import {
  PostgresArtifactStore,
  artifactMigrations,
  runMigrations,
} from "@agentplat/artifacts-postgres";

declare const store: ArtifactStore;
declare const publisher: EventPublisher;
declare const reference: ArtifactReference;
const formats: readonly ArtifactFormat[] = [
  "markdown",
  "text",
  "code",
  "csv",
  "html",
  "json",
];
const service = new ArtifactService({ store });
const head = service.read(
  { tenantId: reference.tenantId ?? "tenant" },
  reference.id,
  reference.revision,
);
const drain = drainArtifactOutbox(store, publisher);
void [
  formats,
  head,
  drain,
  artifactFormats,
  artifactMigrations,
  PostgresArtifactStore,
  runMigrations,
];
