# SKILLS.md — اسکیل‌های Claude Code مخصوص پروژه Manto Moda

> **برای ایجنت‌ها:** این سند مشخص می‌کند هر مرحله از نقشه راه / هر Agent Role از کدام Claude Skill استفاده کند.
> منبع اسکیل‌ها: [`someclaudeskills.com`](https://someclaudeskills.com/) (مخزن `erichowens/some_claude_skills`، مجوز MIT).
> نصب: `bash scripts/install-claude-skills.sh` — فایل‌ها در `~/.claude/skills/` قرار می‌گیرند و Claude Code خودکار آن‌ها را می‌شناسد.
> بازبینی‌شده: ۲۰۲۶-۰۹-۲۰ | ۶۹ اسکیل فعال از ۱۸۸ اسکیل موجود | همه از نظر امنیتی اسکن شده‌اند (بدون `curl|bash`، بدون سکرت هاردکد‌شده).

---

## ۱. چرا این ۶۹ اسکیل؟ (منطق انتخاب)

پروژه Manto Moda سه ویژگی متمایز دارد که انتخاب اسکیل را تعیین کرد:

1. **AI-Native و چند-ایجنتی است** (۱۳ نقش در `agents/`، ۶ اسکریپت در `skills/`، MCP Server، `Claude Code` + `Codex` + `Cursor` روی یک ریپو) → اسکیل‌های orchestration و governance اولویت اول شدند.
2. **فروشگاه واقعی با پول واقعی است** (RBAC، ایزوله‌سازی قیمت عمده، درگاه پرداخت) → اسکیل‌های امنیت، تست، و API در اولویت دوم.
3. **موبایل-اول، فارسی و RTL است** (`src/client/public/`) → اسکیل‌های UX موبایل، تایپوگرافی فارسی، دسترس‌پذیری و PWA.

موضوعاتی که به پروژه ربطی نداشتند (پهپاد، VR، عکاسی عروسی، مصاحبه شغلی، سلامت روان، بازی‌سازی) عمداً نصب نشدند — در کتابخانه `~/claude-skills/library/` باقی ماندند.

---

## ۲. نقشه فازهای باقی‌مانده → اسکیل

بر اساس بخش N گزارش `AUDIT_REALITY_REPORT.md`:

### Phase 9.1 — رفع Documentation Drift (README/ARCHITECTURE vs Vanilla JS SPA)
| اسکیل | کاربرد |
| :--- | :--- |
| `technical-writer` | بازنویسی مستندات درست‌شده، ADR و runbook |
| `mermaid-graph-writer` + `mermaid-graph-renderer` | دیاگرام معماری در `ARCHITECTURE.md` (خروجی SVG/PNG) |
| `diagramming-expert` | دیاگرام‌های ASCII برای سندهای متنی و handoff |
| `openapi-spec-writer` | قرارداد API به‌عنوان منبع حقیقت (جلوگیری از drift بعدی) |
| `design-system-documenter` | مستندسازی توکن‌ها و کامپوننت‌های UI |

### Phase 9.2 — گارد سخت شروع production روی `JWT_SECRET`
| اسکیل | کاربرد |
| :--- | :--- |
| `security-auditor` | OWASP + اسکن سکرت + `npm audit` |
| `dependency-management` | رفع CVE‌های انتقالی `qs` / `body-parser` (یافته SEC-02) |
| `error-handling-patterns` | fail-fast صریح در startup، نبود fallback ناامن |
| `launch-readiness-auditor` | معیار «آماده فروش» و لیست بلوکرها |

### Phase 9.3 — PostgreSQL + Prisma (BL-005 / TD-001)
| اسکیل | کاربرد |
| :--- | :--- |
| `postgresql-optimization` | EXPLAIN، ایندکس، pooling، پارتیشن |
| `database-design-patterns` | تصمیم نرمال‌سازی/دِنرمال‌سازی، مهاجرت Zero-Downtime و ایمن |
| `code-architecture` | حفظ مرزهای لایه‌ای Routes → Services → Repository |
| `refactoring-surgeon` | انتقال از `store.js` درون‌حافظه‌ای بدون تغییر رفتار |
| `test-automation-expert` + `vitest-testing-patterns` | تست‌های یکپارچگی دیتابیس (پروژه به Vitest مهاجرت می‌کند) |

### Phase 9.4 — درگاه پرداخت (BL-006) + SMS OTP (BL-007 / TD-003)
| اسکیل | کاربرد |
| :--- | :--- |
| `api-architect` + `rest-api-design` | طراحی adapter قابل تعویض IPG، callback، idempotency |
| `background-job-orchestrator` | صف ارسال OTP، retry با backoff، جلوگیری از اسپم پیامک |
| `caching-strategies` | ذخیره موقت کد OTP و کش کاتالوگ (TD-004 / Redis) |
| `document-generation-pdf` | فاکتور خرده و پیش‌فاکتور عمده، رسید سفارش |
| `email-composer` | ایمیل تأیید سفارش و اطلاع‌رسانی وضعیت |

### Phase 10 — حلقه تکامل خودکار (Autonomous Evolution Daemon)
| اسکیل | کاربرد |
| :--- | :--- |
| `orchestrator` | هماهنگی چند اسپشیالیست روی یک مسئله (هم‌راستا با `skills/orchestrator.js`) |
| `task-decomposer` | شکستن Roadmap به گره‌های قابل اجرا با وابستگی صریح |
| `skillful-subagent-creator` | ساخت subagent با اسکیل‌های منتخب برای هر گره DAG |
| `output-contract-enforcer` | اعتبارسنجی خروجی هر گره با JSON Schema قبل از گره بعدی |
| `human-gate-designer` | طراحی نقاط تصمیم انسانی (بخش ۸ `PROJECT_STATE.md`) |
| `liaison` | تبدیل فعالیت چند-ایجنتی به بریف خوانا برای انسان (`PROJECT_HANDOFF.md`) |

---

## ۳. نقشه ۱۳ Agent Role → اسکیل

| Agent Role | اسکیل‌های پشتیبان |
| :--- | :--- |
| **01 System Architect** | `code-architecture`, `systems-thinking`, `database-design-patterns`, `api-architect`, `diagramming-expert` |
| **02 Core Developer** | `refactoring-surgeon`, `error-handling-patterns`, `rest-api-design`, `form-validation-architect`, `nextjs-app-router-expert` |
| **03 QA & Test Engineer** | `test-automation-expert`, `vitest-testing-patterns`, `playwright-e2e-tester`, `playwright-screenshot-inspector`, `webapp-testing`, `checklist-discipline` |
| **04 Security & Privacy Officer** | `security-auditor`, `dependency-management`, `launch-readiness-auditor` |
| **05 Release & DevOps Operator** | `docker-containerization`, `devops-automator`, `github-actions-pipeline-builder`, `launch-readiness-auditor` |
| **06 Performance Engineer** | `performance-profiling`, `caching-strategies`, `react-performance-optimizer`, `logging-observability` |
| **07 Dependency & Supply-Chain** | `dependency-management`, `security-auditor` |
| **08 UX & Accessibility** | `design-accessibility-auditor`, `color-contrast-auditor`, `typography-expert`, `mobile-ux-optimizer`, `pwa-expert`, `ux-friction-analyzer` |
| **09 Data & Database Architect** | `database-design-patterns`, `postgresql-optimization`, `caching-strategies` |
| **10 Observability & SRE** | `logging-observability`, `performance-profiling`, `launch-readiness-auditor` |
| **11 Documentation & Governance** | `technical-writer`, `mermaid-graph-writer`, `mermaid-graph-renderer`, `openapi-spec-writer`, `design-system-documenter` |
| **12 Red Team Adversarial Tester** | `security-auditor`, `playwright-e2e-tester`, `launch-readiness-auditor`, `checklist-discipline` |
| **13 World-Class Researcher** | `research-analyst`, `competitive-cartographer`, `product-appeal-analyzer`, `design-critic`, `seo-visibility-expert`, `ultimate-seo-geo-skill` |
| **(همه) تولید اسکیل/ایجنت جدید** | `skill-creator`, `skill-architect`, `skill-coach`, `skill-grader`, `agent-creator`, `mcp-creator` |
| **(همه) هوش مصنوعی پروژه** | `ai-engineer`, `prompt-engineer`, `mcp-creator`, `llm-router`, `very-long-text-summarization` |

---

## ۴. نقشه UI/UX (موبایل-اول، فارسی، RTL)

| نیاز پروژه | اسکیل |
| :--- | :--- |
| هویت بصری برند مزون | `web-design-expert`, `product-appeal-analyzer` |
| تایپوگرافی فارسی و سلسله‌مراتب | `typography-expert` |
| سیستم طراحی + توکن Tailwind | `design-system-creator`, `design-system-generator`, `design-system-documenter` |
| بررسی زیبایی‌شناسی و نقد طرح | `design-critic` |
| نرخ تبدیل و کاهش اصطکاک سبد/تسویه | `ux-friction-analyzer` |
| تاچ‌تارگت ۴۴px، ناوبری پایین، dvh | `mobile-ux-optimizer` |
| PWA و نصب روی صفحه اصلی موبایل | `pwa-expert` |
| WCAG و کنتراست رنگی | `design-accessibility-auditor`, `color-contrast-auditor` |
| فرم‌های چندمرحله‌ای تسویه و درخواست عمده | `form-validation-architect` |
| داشبورد ادمین و KPI | `data-viz-2025` |

---

## ۵. نقشه SEO و Growth

| هدف | اسکیل |
| :--- | :--- |
| SSR/SEO آینده (TD-005) | `nextjs-app-router-expert`, `react-performance-optimizer` |
| SEO فنی، Core Web Vitals، Schema محصول | `ultimate-seo-geo-skill` |
| ایندکس‌شدن در موتورهای پاسخ‌گو (AI Overviews / Perplexity) | `seo-visibility-expert`, `ultimate-seo-geo-skill` |
| تحلیل رقبا و فضای خالی بازار پوشاک ایران | `competitive-cartographer`, `research-analyst` |

---

## ۶. دستورهای نصب و نگهداری

```bash
# نصب روی هر ماشینی که ریپو را کلون کرده (اسکیل‌ها را از مخزن اصلی می‌گیرد)
bash scripts/install-claude-skills.sh

# نصب داخل خود ریپو به‌جای پوشه کاربر (برای تیم‌های چندنفره: اسکیل‌ها همراه ریپو نسخه‌بندی می‌شوند)
bash scripts/install-claude-skills.sh --into-repo

# فقط یک گروه خاص
bash scripts/install-claude-skills.sh --group ux

# حذف همه اسکیل‌های این ست
bash scripts/install-claude-skills.sh --uninstall
```

روش جایگزین (مارکت‌پلیس رسمی داخل Claude Code):
```
/plugin marketplace add erichowens/some_claude_skills
/plugin install skill-creator@some-claude-skills
```

---

## ۷. نکات و هشدارها

1. **هزینه توکن:** ۶۹ اسکیل فعال حدود ۴ هزار توکن توضیحات در هر نشست مصرف می‌کند. اگر سنگین شد، با `bash scripts/install-claude-skills.sh --group <g>` فقط گروه‌های لازم را نگه دارید.
2. **اسکیل‌ها فقط دستورالعمل‌اند.** اسکریپت‌های همراهشان (`scripts/*.sh`, `*.py`) قبل از اجرا مرور شوند. در این مجموعه هیچ الگوی `curl | bash` در ست انتخابی وجود ندارد (تنها مورد پرچم‌دار، اسکیل `automatic-stateful-prompt-improver` بود که نصب نشد).
3. **`port-daddy` عمداً نصب نشد:** با وجود تناسب با کار چند-ایجنتی، یک daemon پس‌زمینه با راه‌اندازی جداگانه لازم دارد. در کتابخانه موجود است: `./tools/skills info port-daddy`.
4. **قانون پروژه رعایت شد:** هیچ‌کدام از این اسکیل‌ها چیزی به `PROJECT_STATE.md` / `TASKS.md` اضافه نمی‌کنند مگر خودتان بخواهید. مهارت‌ها ابزار کار ایجنت‌اند، نه وضعیت پروژه.
5. **به‌روزرسانی:** برای نسخه جدید مجموعه، مجدد `bash scripts/install-claude-skills.sh --force` را اجرا کنید.
