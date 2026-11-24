#!/usr/bin/env node
// Checks that a release tag agrees with the version recorded in the repo (see version-files.mjs).
// Used by the release workflow before any image is built or pushed.
//
//   node scripts/check-version.mjs v5.0.0
//   node scripts/check-version.mjs v5.0.0-rc.1
//
// Exits non-zero with a clear message on any mismatch or malformed tag.

import { versionFiles, readVersion } from "./version-files.mjs";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node scripts/check-version.mjs <tag>  (e.g. v5.0.0 or v5.0.0-rc.1)");
  process.exit(2);
}
if (!tag.startsWith("v")) {
  fail(`Tag "${tag}" must start with "v" (e.g. v5.0.0).`);
}
const version = tag.replace(/^v/, "");
if (!SEMVER.test(version)) {
  fail(`Tag "${tag}" is not a valid version (expected vX.Y.Z or vX.Y.Z-something).`);
}

for (const file of versionFiles) {
  try {
    const { current } = readVersion(file);
    if (current === version) {
      console.log(`✓ ${file.path}: ${current}`);
    } else {
      fail(`${file.path} says "${current}", but tag "${tag}" means "${version}". Run: node scripts/set-version.mjs ${version}`);
    }
  } catch (error) {
    fail(error.message);
  }
}

if (process.exitCode) {
  console.error("\nVersion check failed.");
  process.exit(process.exitCode);
}
console.log(`\nAll version files agree with ${tag}.`);
