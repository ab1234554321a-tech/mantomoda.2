// research/benchmarks/compare-reference-sites.js
//
// Weekly benchmark: compares Manto Moda's HTTP response against a fixed
// set of reference sites on things that are actually measurable from
// outside — response headers and response time. This is NOT a claim
// about which site is "better" overall; it's a narrow, honest signal
// on security headers and speed that we can track over time.
//
// Add/replace MANTO_MODA_URL once the site is live at a public URL.

const REFERENCE_SITES = [
  { name: 'Digikala', url: 'https://www.digikala.com' },
  { name: 'Basalam', url: 'https://basalam.com' },
  { name: 'Zara', url: 'https://www.zara.com' },
  { name: 'ASOS', url: 'https://www.asos.com' },
];

const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
];

// A real browser UA. Anti-bot protections on some sites (Cloudflare, etc.)
// block requests that self-identify as scanners/bots, which isn't a
// signal about the target's own security — it just breaks the probe.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function hasMetaCsp(html) {
  return /<meta[^>]+http-equiv=["']content-security-policy["']/i.test(html || '');
}

async function probe(name, url) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });
    const elapsedMs = Date.now() - start;
    const html = await res.text();

    // CSP can arrive as an HTTP header OR as an HTML <meta> tag — a site
    // using only the meta form isn't missing CSP, it's just not visible
    // in res.headers. Check both so we don't understate a site's score.
    const cspViaHeader = res.headers.has('content-security-policy');
    const cspViaMeta = !cspViaHeader && hasMetaCsp(html);

    const presentHeaders = SECURITY_HEADERS.filter((h) => {
      if (h === 'content-security-policy') return cspViaHeader || cspViaMeta;
      return res.headers.has(h);
    });
    const missingHeaders = SECURITY_HEADERS.filter((h) => !presentHeaders.includes(h));

    return {
      name,
      url,
      status: res.status,
      elapsedMs,
      cspSource: cspViaMeta ? 'meta tag' : cspViaHeader ? 'header' : null,
      securityHeaderScore: `${presentHeaders.length}/${SECURITY_HEADERS.length}`,
      missingHeaders,
    };
  } catch (err) {
    return { name, url, error: err.message };
  }
}

async function main() {
  const targets = [...REFERENCE_SITES];
  if (process.env.MANTO_MODA_URL) {
    targets.unshift({ name: 'Manto Moda (us)', url: process.env.MANTO_MODA_URL });
  }

  console.log('📡 Probing reference sites for response latency and security headers...\n');
  const results = await Promise.all(targets.map((t) => probe(t.name, t.url)));

  const date = new Date().toISOString().slice(0, 10);
  const rows = results.map((r) =>
    r.error
      ? `| ${r.name} | error: ${r.error} | — | — |`
      : `| ${r.name} | ${r.status} | ${r.elapsedMs}ms | ${r.securityHeaderScore}${r.cspSource === 'meta tag' ? ' (CSP via meta tag)' : ''}${r.missingHeaders.length ? ` (missing: ${r.missingHeaders.join(', ')})` : ''} |`
  );

  const report = [
    `## Benchmark run — ${date}`,
    '',
    '| Site | Status | Response time | Security headers |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');

  console.log(report);

  if (!process.env.MANTO_MODA_URL) {
    console.log(
      '\nNote: MANTO_MODA_URL was not set, so only reference sites were checked. ' +
      'Set it once the site has a public URL to include ourselves in the comparison.'
    );
  }
}

main();
