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
  {
    // tauri.conf.json reads the app version from here ("version": "../package.json").
    path: "desktop/package.json",
    pattern: /^  "version": "([^"]*)",$/m,
    replace: (version) => `  "version": "${version}",`,
  },
  {
    // The first line-leading `version = ` is [package]; dependency versions are inline tables.
    path: "desktop/src-tauri/Cargo.toml",
    pattern: /^version = "([^"]*)"$/m,
    replace: (version) => `version = "${version}"`,
  },
  {
    // Kept in step so CI's `--locked` builds don't fail after a version bump.
    path: "desktop/src-tauri/Cargo.lock",
    pattern: /^\[\[package\]\]\nname = "arbodat-plus"\nversion = "([^"]*)"$/m,
    replace: (version) => `[[package]]\nname = "arbodat-plus"\nversion = "${version}"`,
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
