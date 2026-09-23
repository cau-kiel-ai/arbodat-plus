// Shared list of files that carry the ArboDat+ release version, used by both set-version.mjs and
// check-version.mjs so the two can never drift apart from each other.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export const versionFiles = [
  {
    path: "web-api/build.gradle",
    pattern: /^version = '([^']*)'$/m,
    replace: (version) => `version = '${version}'`,
  },
];

export function readVersion(file) {
  const content = readFileSync(join(repoRoot, file.path), "utf8");
  const match = content.match(file.pattern);
  if (!match) {
    throw new Error(`${file.path}: version pattern not found (expected to match ${file.pattern})`);
  }
  return { content, current: match[1] };
}
