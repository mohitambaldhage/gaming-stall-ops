import fs from 'node:fs';
import path from 'node:path';
import { DOCS_DIR, PUBLIC_DIR } from './config.mjs';
import { DEFAULT_SETTINGS, INITIAL_LAPTOPS } from './seed.mjs';

fs.rmSync(DOCS_DIR, { recursive: true, force: true });
fs.cpSync(PUBLIC_DIR, DOCS_DIR, { recursive: true });
fs.writeFileSync(path.join(DOCS_DIR, '.nojekyll'), '');

// Also emit fallback seed JSON in public/ and docs/ so static GitHub Pages loads exact 7 laptops cleanly
const seedJson = JSON.stringify({ settings: DEFAULT_SETTINGS, laptops: INITIAL_LAPTOPS }, null, 2);
fs.writeFileSync(path.join(PUBLIC_DIR, 'seed.json'), seedJson);
fs.writeFileSync(path.join(DOCS_DIR, 'seed.json'), seedJson);

console.log(`Static GitHub Pages / Firebase Hosting bundle written to: ${DOCS_DIR}`);
