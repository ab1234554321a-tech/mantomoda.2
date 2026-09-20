# SECURITY-TRIAGE.md — Findings Reviewed and Rejected

> **Rule (ADR-023):** an automated scanner produces *candidates*, not verdicts. Every finding that
> contradicts the architecture is reviewed by hand, and the rejection is recorded **here** instead of
> being silently ignored. `scripts/skills-audit.sh` reads this list, subtracts these rules from its
> counts, and reports what is left as "needs action".
>
> Adding a rule to this file is a commitment: it must be listed with the reason it cannot occur in
> this codebase, and with the proof that would catch it if it ever did.

Last review: 2026-09-20 (report: `reports/skills-audit-*.md`)

---

## Rejected rule classes

### 1. `SQL template injection` (reported CRITICAL, OWASP A03)

**Rejected because the project contains no SQL and no SQL database.** The store is a JSON snapshot
(ADR-010): `src/server/db/store.js` holds documents in memory and persists them with `fs.writeFile`,
and every lookup is a JavaScript `Array.find`. The scanner's rule fires on *any* template literal that
also contains one of the words `SELECT`/`INSERT`/`UPDATE`/`DELETE`, which in this codebase means HTTP
verbs and Persian UI strings, e.g.:

```js
const res = await apiFetch(`/api/admin/coupons/${id}`, { method: 'DELETE' });
```

**Proof that would catch a real regression:** if a real database is ever introduced (`TD-006`), every
new query must be parameterised, and this rule must be removed from this file in the same pull request.
Until then the rule cannot describe a real defect here.

---

### 2. `innerHTML assignment` (reported HIGH, 39 occurrences)

**Rejected as a *class*, not per-line.** `innerHTML` is not the defect — unencoded interpolation into
it is. All 36 places where human-typed text (customer or admin) is interpolated are now wrapped in
`escapeHtml()` / `escapeAttr()`, and the remaining `innerHTML` uses render literal markup only.
One of these chains *was* exploitable and is fixed: see ADR-022 (customer-supplied wholesale fields
rendered in the admin panel).

**Proof that would catch a real regression:** `tests/escaping.test.js` (Level 9) fails the build if any
risky interpolation in the shipped client is missing its encoder, and it is mutation-tested — deleting
a single `escapeHtml()` call turns the suite red. The suite runs in CI as part of `npm test`.
Adding a new customer-editable field therefore does not rely on the scanner: add the interpolation to
the suite's list and the guard covers it.

---

### 3. `Short password constant` (reported HIGH)

**Rejected because the match is a list of *field names*, not a secret.** The evidence line is
`const REDACTED_KEYS = ['password', 'token', 'apiKey', 'authorization', 'secret'];` in
`src/server/middlewares/admin-audit.js` — the very list that stops those fields from being written to
the audit log. The rule looks for the substring `pass` followed by a quoted string.

**Proof that would catch a real regression:** the secret scan (`detect-secrets.sh`) runs in the same
audit, plus the CI job "Verify no secrets were committed", plus `tests/security.test.js` asserting
hashed passwords. A real committed credential would be reported by any of the three.

---

### 4. `Non-production check` (reported LOW, OWASP A05)

**Rejected because the flagged line *is* the environment-specific guard it asks for.** The evidence is
`src/server/services/otp.service.js`:

```js
return providerName === 'mock' && process.env.NODE_ENV !== 'production';
```

The mock SMS provider is deliberately allowed in development/test and impossible in production, which
is exactly the intent; a production start with a mock provider is additionally refused at boot
(`ALLOW_MOCK_PROVIDERS`) and flagged by `scripts/preflight.sh`.

**Proof that would catch a real regression:** the preflight audit fails when a mock provider is
selected in production, and the production-start guard is covered by the test gate.

---

## Kept as real (fixed, for reference)

| Finding | Rule | Resolution |
|---|---|---|
| `Math.random()` building the order number (9,000-value space; invoices are looked up *by number*) | OWASP A02 | Persisted monotonic sequence + `crypto` for all identity fields — ADR-022, regression test in the commerce suite |
| `Math.random()` in the mock payment reference and in user/product/coupon/audit ids | OWASP A02 | `crypto.randomInt` / `crypto.randomBytes` |
| Unencoded customer text in the admin panel (wholesale queue, order list) | OWASP A03 class of the `innerHTML` rule | One encoder for all 36 human-entered interpolations — ADR-022, Level 9 suite |

> A `Math.random()` mention that lives **inside a comment** is not a finding; the comment explaining the
> order-number fix was reworded so the scanner no longer counts its own documentation as a defect.
