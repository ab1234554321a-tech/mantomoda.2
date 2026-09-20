# reports/ — generated evidence

Everything in this folder is **generated**, never hand-written. It is produced by:

```bash
npm run skills-audit      # bash scripts/skills-audit.sh
```

Each run writes a new timestamped set:

| File | Produced by | Contents |
|---|---|---|
| `skills-audit-<stamp>.md` | the audit script | the readable report: per-check verdicts, the OWASP triage table and links to the raw evidence |
| `owasp-<stamp>.txt` | `security-auditor/scripts/owasp-check.py` | raw pattern findings for `src/` |
| `secrets-<stamp>.txt` | `security-auditor/scripts/detect-secrets.sh` | raw credential scan of the application code |
| `tests-<stamp>.log` | `npm test` | full test gate output |
| `a11y-<stamp>.log` | `npm run a11y` | accessibility gate output |
| `preflight-<stamp>.txt` | `scripts/preflight.sh` | environment readiness audit |

The latest run is committed as evidence; older runs are deleted so the repository does not fill with
logs (CI uploads each run as a build artifact instead). Findings that were reviewed and rejected are
documented in [`../SECURITY-TRIAGE.md`](../SECURITY-TRIAGE.md) — a scanner's output is a candidate, not
a verdict.
