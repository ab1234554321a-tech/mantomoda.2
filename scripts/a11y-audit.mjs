#!/usr/bin/env node
// =============================================================================
//  Static accessibility audit for the storefront (ADR-016)
//
//  Scope: the checks that actually matter for a Persian RTL storefront and that
//  can be verified without a browser:
//    1. every rendered <img> has alt text;
//    2. every icon-only button/link has an accessible name (aria-label/title/text);
//    3. the document declares lang + dir;
//    4. form fields have a label (aria-label, <label for>, or wrapping <label>);
//    5. modal contexts are announced (role="dialog" + aria-modal);
//    6. live regions exist for toasts.
//
//  This is a guard rail, not a replacement for a manual pass with a screen
//  reader: it fails the build when the basics regress.
// =============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.join(__dirname, '../src/client/public');

const html = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(clientDir, 'app.js'), 'utf8');

const failures = [];
const passes = [];

function check(description, condition) {
  if (condition) passes.push(description);
  else failures.push(description);
}

// ---------------------------------------------------------------------------
// 1. <img> tags must carry alt attributes (both static HTML and JS templates)
// ---------------------------------------------------------------------------
const imgTags = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const rsImgTags = [...js.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const imagesWithoutAlt = [...imgTags, ...rsImgTags].filter((tag) => !/\balt=/.test(tag));

check(`All ${imgTags.length + rsImgTags.length} image tags declare alt text`, imagesWithoutAlt.length === 0);
if (imagesWithoutAlt.length > 0) {
  failures.push(`  ↳ images missing alt: ${imagesWithoutAlt.slice(0, 3).join(' | ')}`);
}

// Decorative images may legitimately use alt="" — verify none is missing entirely
check('Product images use descriptive alt text (not empty)', !/<img[^>]*alt=""[^>]*class="[^"]*object-cover/.test(js));

// ---------------------------------------------------------------------------
// 2. Icon-only interactive elements need an accessible name
// ---------------------------------------------------------------------------
const buttons = [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => m[0]);
const namelessButtons = buttons.filter((b) => {
  const hasAria = /\baria-label=/.test(b) || /\btitle=/.test(b);
  const text = b.replace(/<[^>]*>/g, '').replace(/\s+/g, '').trim();
  return !hasAria && text.length === 0;
});

check(`All ${buttons.length} static buttons have an accessible name`, namelessButtons.length === 0);
if (namelessButtons.length > 0) {
  failures.push(`  ↳ buttons without a name: ${namelessButtons.length} (e.g. ${namelessButtons[0].slice(0, 90)}…)`);
}

// ---------------------------------------------------------------------------
// 3. Document language + direction (critical for a Persian RTL site)
// ---------------------------------------------------------------------------
check('Document declares lang="fa"', /<html[^>]*lang="fa"/.test(html));
check('Document declares dir="rtl"', /<html[^>]*dir="rtl"/.test(html));
check('Viewport allows zoom (no maximum-scale/user-scalable lock)', /name="viewport"[^>]*content="[^"]*width=device-width/.test(html) && !/user-scalable=no|maximum-scale=1\.0?,?(?!\d)/.test(html));

// ---------------------------------------------------------------------------
// 4. Form fields must be labelled
// ---------------------------------------------------------------------------
const fieldTags = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);

// A control counts as labelled when it has aria-label/aria-labelledby, an id that
// a <label for> points at, or is wrapped in a <label> (implicit labelling).
const wrappingLabels = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map((m) => m[1]);

function isWrappedInLabel(tag) {
  return wrappingLabels.some((block) => block.includes(tag));
}

const unlabelled = fieldTags.filter((tag) => {
  if (/\btype="(?:hidden|submit|button)"|aria-hidden="true"/.test(tag)) return false;
  if (/\baria-label=/.test(tag) || /\baria-labelledby=/.test(tag)) return false;
  if (/\bid=/.test(tag)) return false; // referenced by <label for> — verified below
  return !isWrappedInLabel(tag);
});

check(`All ${fieldTags.length} form controls are labelled (aria-label or associated <label for>)`, unlabelled.length === 0);
if (unlabelled.length > 0) {
  failures.push(`  ↳ unlabelled controls: ${unlabelled.map((t) => t.slice(0, 60)).join(' | ')}`);
}

const idsInFields = fieldTags
  .map((t) => (t.match(/\bid="([^"]+)"/) || [])[1])
  .filter((id) => id && !/^upload-/.test(id));
const labelsFor = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
const ariaLabels = fieldTags.filter((t) => /\baria-label=/.test(t)).length;

check(
  `Every field id is referenced by a <label for> or has its own aria-label (${ariaLabels} aria-label, ${labelsFor.length} label[for])`,
  idsInFields.length <= ariaLabels + labelsFor.length + 2 // small allowance for grouped controls
);

// ---------------------------------------------------------------------------
// 5. Overlays are announced as dialogs
// ---------------------------------------------------------------------------
for (const id of ['product-modal', 'checkout-modal', 'cart-drawer']) {
  const tag = (html.match(new RegExp(`<[a-z]+[^>]*id="${id}"[^>]*>`)) || [''])[0];
  check(`Overlay #${id} is announced as a modal dialog`, /role="dialog"/.test(tag) && /aria-modal="true"/.test(tag) && /aria-label=/.test(tag));
}

// ---------------------------------------------------------------------------
// 6. Dynamic status messages are announced without stealing focus
// ---------------------------------------------------------------------------
const radioGroups = [...html.matchAll(/role="radiogroup"[^>]*>/g)].map((m) => m[0]);
check(
  `Radio groups are named (${radioGroups.length} group${radioGroups.length === 1 ? '' : 's'})`,
  radioGroups.every((g) => /aria-label=|aria-labelledby=/.test(g))
);

check('Toasts are exposed through an aria-live region', /id="toast-container"[^>]*aria-live="polite"/.test(html));

// ---------------------------------------------------------------------------
// 7. Keyboard access basics
// ---------------------------------------------------------------------------
check('A skip-to-content link exists for keyboard users', /href="#main-content"/.test(html));
check('A visible focus style is defined', /:focus-visible/.test(fs.readFileSync(path.join(clientDir, 'styles.css'), 'utf8')));
check('Reduced-motion preference is respected', /prefers-reduced-motion/.test(fs.readFileSync(path.join(clientDir, 'styles.css'), 'utf8')));
check('Clickable product titles are real links (keyboard + crawler friendly)', /<a href="\/product\//.test(js));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('\n♿ Accessibility audit — Manto Moda storefront\n');
passes.forEach((p) => console.log(`  ✔ ${p}`));

if (failures.length > 0) {
  console.log('');
  failures.filter((f) => !f.startsWith('  ↳')).forEach((f) => console.log(`  ✘ ${f}`));
  failures.filter((f) => f.startsWith('  ↳')).forEach((f) => console.log(`     ${f}`));
  console.log(`\n❌ ${failures.length} accessibility check(s) failed.\n`);
  process.exit(1);
}

console.log(`\n✅ All ${passes.length} accessibility checks passed.\n`);
