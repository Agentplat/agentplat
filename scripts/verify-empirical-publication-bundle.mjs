#!/usr/bin/env node

import path from "node:path";
import { verifyPublicationBundleV1 } from "./empirical-publication-bundle.mjs";

const directory = process.argv[2] ?? process.env.AGENTPLAT_PUBLICATION_BUNDLE;
if (!directory || process.argv.length > 3) {
  process.stderr.write("usage: node scripts/verify-empirical-publication-bundle.mjs <results-directory>\n");
  process.exit(2);
}
try {
  const result = await verifyPublicationBundleV1(path.resolve(directory));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "publication_bundle_verification_failed"}\n`);
  process.exit(2);
}
