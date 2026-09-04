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

async function probe(name, url) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (MantoModa-BenchmarkScanner/1.0)'
      }
    });
    const elapsedMs = Date.now() - start;
    const presentHeaders = SECURITY_HEADERS.filter((h) => res.headers.has(h));
    return {
      name,
      url,
      status: res.status,
      elapsedMs,
      securityHeaderScore: `${presentHeaders.length}/${SECURITY_HEADERS.length}`,
      missingHeaders: SECURITY_HEADERS.filter((h) => !res.headers.has(h)),
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
      : `| ${r.name} | ${r.status} | ${r.elapsedMs}ms | ${r.securityHeaderScore}${r.missingHeaders.length ? ` (missing: ${r.missingHeaders.join(', ')})` : ''} |`
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
