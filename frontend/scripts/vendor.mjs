// Copies the pinned third-party libraries (package.json / package-lock.json) from node_modules/
// into vendor/<pkg>@<version>/ and keeps every reference to them in the pages and stylesheets
// pointing at the installed version. vendor/ is committed, so nothing else needs Node to run the app.
//
//   npm ci && npm run vendor
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = join(root, 'vendor');

// package -> files/dirs (relative to the package) to ship, in the same relative layout.
// Leaflet's CSS finds its marker images at ../images relative to itself, so dist/ stays intact.
const manifest = {
  axios: ['dist/axios.min.js'],
  bootstrap: ['dist/js/bootstrap.bundle.min.js', 'scss'], // scss = Sass build input only (not served)
  jquery: ['dist/jquery.min.js'],
  leaflet: ['dist/leaflet.js', 'dist/leaflet.css', 'dist/images'],
  proj4: ['dist/proj4.js'],
  select2: ['dist/js/select2.min.js', 'dist/css/select2.min.css'],
  sortablejs: ['Sortable.min.js'],
  'tabulator-tables': ['dist/js/tabulator.min.js', 'dist/css/tabulator.min.css'],
  xlsx: ['dist/xlsx.full.min.js'],
};

const fail = (msg) => {
  console.error(`vendor: ${msg}`);
  process.exit(1);
};

const versions = {};
rmSync(vendorDir, { recursive: true, force: true });
for (const [pkg, paths] of Object.entries(manifest)) {
  const pkgDir = join(root, 'node_modules', pkg);
  if (!existsSync(pkgDir)) fail(`${pkg} is not installed - run "npm ci" first`);
  const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
  versions[pkg] = version;
  const dest = join(vendorDir, `${pkg}@${version}`);
  for (const rel of paths) {
    if (!existsSync(join(pkgDir, rel))) fail(`${pkg}@${version} has no ${rel}`);
    mkdirSync(dirname(join(dest, rel)), { recursive: true });
    cpSync(join(pkgDir, rel), join(dest, rel), { recursive: true });
  }
  // Ship each library's license next to its files.
  for (const f of readdirSync(pkgDir)) {
    if (/^licen[cs]e/i.test(f)) cpSync(join(pkgDir, f), join(dest, f));
  }
}

// Point every vendor/<pkg>@<version>/ reference at the installed version.
const refs = new RegExp(`vendor/(${Object.keys(manifest).join('|')})@[^/"')\\s]+/`, 'g');
const sources = [
  ...readdirSync(root).filter((f) => f.endsWith('.html')),
  ...readdirSync(join(root, 'scss')).filter((f) => f.endsWith('.scss')).map((f) => `scss/${f}`),
];
for (const file of sources) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  const after = before.replace(refs, (_, pkg) => `vendor/${pkg}@${versions[pkg]}/`);
  if (after !== before) writeFileSync(path, after);
}

// Every referenced vendored file must exist.
for (const file of sources) {
  const base = dirname(join(root, file));
  const text = readFileSync(join(root, file), 'utf8');
  const wanted = file.endsWith('.html')
    ? [...text.matchAll(/(?:src|href)="(vendor\/[^"]+)"/g)].map((m) => join(root, m[1]))
    : [...text.matchAll(/@import\s+'([^']*vendor\/[^']+)'/g)].map((m) => `${resolve(base, m[1])}.scss`);
  for (const p of wanted) if (!existsSync(p)) fail(`${file} references missing ${p.replace(`${root}/`, '')}`);
}

console.log(Object.entries(versions).map(([p, v]) => `${p}@${v}`).join('\n'));
