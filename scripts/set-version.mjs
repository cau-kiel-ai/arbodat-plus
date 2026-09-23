#!/usr/bin/env node
// Bumps the ArboDat+ release version in every file that carries it (see version-files.mjs).
// Run this, review the diff, commit it, then `git tag vX.Y.Z`
//
//   node scripts/set-version.mjs 5.0.0
//   node scripts/set-version.mjs 5.0.0-rc.1

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { versionFiles, readVersion, repoRoot } from "./version-files.mjs";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/;

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/set-version.mjs <version>  (e.g. 5.0.0 or 5.0.0-rc.1, no leading v)");
  process.exit(2);
}
if (!SEMVER.test(version)) {
  console.error(`"${version}" is not a valid version (expected X.Y.Z or X.Y.Z-something, no leading "v").`);
  process.exit(1);
}

for (const file of versionFiles) {
  const { content, current } = readVersion(file);
  if (current === version) {
    console.log(`= ${file.path}: already ${version}`);
    continue;
  }
  const updated = content.replace(file.pattern, file.replace(version));
  writeFileSync(join(repoRoot, file.path), updated);
  console.log(`✓ ${file.path}: ${current} -> ${version}`);
}

console.log(`\nDone. Review the diff, commit it, then: git tag v${version}`);
