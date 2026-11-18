#!/usr/bin/env node
// Bumps the ArboDat+ release version in every file that carries it (see version-files.mjs).
// Also sets `date-released` in CITATION.cff to today, or to the optional second argument.
// Run this, review the diff, commit it, then `git tag vX.Y.Z`
//
//   node scripts/set-version.mjs 5.0.0
//   node scripts/set-version.mjs 5.0.0-rc.1
//   node scripts/set-version.mjs 5.0.0 2026-12-01     # release date other than today

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { versionFiles, citationFile, readVersion, repoRoot } from "./version-files.mjs";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/set-version.mjs <version> [release-date]  (e.g. 5.0.0 or 5.0.0-rc.1, no leading v; date as YYYY-MM-DD, default today)");
  process.exit(2);
}
if (!SEMVER.test(version)) {
  console.error(`"${version}" is not a valid version (expected X.Y.Z or X.Y.Z-something, no leading "v").`);
  process.exit(1);
}

const today = new Date();
const releaseDate =
  process.argv[3] ??
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
if (!ISO_DATE.test(releaseDate)) {
  console.error(`"${releaseDate}" is not a valid date (expected YYYY-MM-DD).`);
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

{
  const { content, current } = readVersion(citationFile);
  if (current === releaseDate) {
    console.log(`= ${citationFile.path}: date-released already ${releaseDate}`);
  } else {
    writeFileSync(join(repoRoot, citationFile.path), content.replace(citationFile.pattern, citationFile.replace(releaseDate)));
    console.log(`✓ ${citationFile.path}: date-released ${current} -> ${releaseDate}`);
  }
}

console.log(`\nDone. Review the diff, commit it, then: git tag v${version}`);
