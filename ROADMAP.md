# Manto Moda — Master Development Roadmap

## 0. هدف اصلی پروژه

هدف، ساخت و رساندن پروژه‌ی Manto Moda به یک محصول واقعی و Production-Ready است؛ نه صرفاً ساخت چند صفحه یا تولید کد.

سیستم توسعه باید به شکلی طراحی شود که:
- GitHub مرجع اصلی و حقیقت پروژه باشد.
- Claude Code و Codex هر دو بتوانند مستقل پروژه را بررسی و ادامه دهند.
- MCP امکان دسترسی کنترل‌شده‌ی AI به منابع و ابزارهای پروژه را فراهم کند.
- وضعیت پروژه وابسته به تاریخچه‌ی چت هیچ مدل AI نباشد.
- هر AI بتواند بفهمد پروژه دقیقاً در چه مرحله‌ای قرار دارد.
- AI خودش وضعیت پروژه را بررسی کند و منتظر نماند کاربر بگوید «الان کجاییم؟».
- اگر مشکلی وجود دارد که کاربر باید از آن مطلع شود، AI خودش آن را گزارش کند.
- Claude و Codex بتوانند روی یک پروژه مشترک کار کنند، بدون اینکه کاربر واسطه‌ی انتقال Context بین آن‌ها باشد.
- اگر ۵۰٪ پروژه با Claude و ۱۰٪ دیگر با Codex انجام شده باشد، هر دو بتوانند وضعیت جدید را از Repository و Project State تشخیص دهند.
- قبل از تغییر کد، وضعیت واقعی پروژه بررسی شود.
- کد موجود بی‌دلیل بازنویسی نشود.
- قابلیت‌های سالم موجود حفظ شوند.
- تغییرات قابل ردیابی، قابل بررسی و قابل Rollback باشند.
- پروژه در نهایت به یک سیستم واقعی، امن، قابل نگهداری و قابل توسعه تبدیل شود.

---

## 1. اصول بنیادین

### 1.1 GitHub منبع حقیقت پروژه است
هیچ‌کدام از موارد زیر نباید تنها محل نگهداری وضعیت پروژه باشند:
- ChatGPT
- Claude
- Codex
- حافظه‌ی یک مدل
- پیام‌های داخل یک چت
- توضیحات دستی کاربر

مرجع اصلی باید Repository باشد.

مدل AI باید بتواند با بررسی Repository بفهمد:
- چه چیزی وجود دارد.
- چه چیزی تغییر کرده.
- چه چیزی کامل شده.
- چه چیزی ناقص است.
- چه چیزی خراب است.
- چه تصمیماتی قبلاً گرفته شده.
- چه کارهایی باقی مانده.
- قدم منطقی بعدی چیست.

---

## 2. معماری کلی سیستم توسعه

```
                         ┌──────────────────┐
                         │      USER        │
                         │  Business Owner  │
                         └────────┬─────────┘
                                  │
                         Decisions / Approval
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                         GITHUB                              │
│                  Source of Truth / Project State            │
│                                                             │
│  Code / Git / Issues / PRs / Docs / State / Decisions       │
└───────────────┬───────────────────────────────┬─────────────┘
                │                               │
                ▼                               ▼
       ┌────────────────┐              ┌────────────────┐
       │  CLAUDE CODE   │              │     CODEX      │
       │                │              │                │
       │ Analyze        │              │ Analyze        │
       │ Implement      │              │ Implement      │
       │ Review         │              │ Review         │
       │ Debug          │              │ Debug          │
       └───────┬────────┘              └────────┬───────┘
               │                                │
               └──────────────┬─────────────────┘
                              ▼
                         ┌──────────┐
                         │   MCP    │
                         │ Tool/API │
                         │ Access   │
                         └────┬─────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
             GitHub         Database      Other Tools
```

---

## 3. نقش هر بخش

### 3.1 GitHub
GitHub مسئول:
- نگهداری Source Code
- Version Control
- Branching
- Commit History
- Pull Request
- Issue Management
- Documentation
- Project State
- Architectural Decisions
- Changelog
- همکاری Claude و Codex

---

## 4. Claude Code
Claude Code یکی از توسعه‌دهندگان اصلی پروژه است.
مسئولیت‌ها:
- بررسی Repository
- تحلیل معماری
- تحلیل کد موجود
- پیدا کردن مشکلات
- طراحی راه‌حل
- پیاده‌سازی قابلیت‌ها
- Refactor کنترل‌شده
- Debug
- Code Review
- بررسی Security
- اجرای Testها
- به‌روزرسانی Project State
- ثبت تصمیمات مهم
- بررسی وضعیت پروژه قبل از شروع کار

---

## 5. Codex
Codex نیز باید به‌عنوان یک توسعه‌دهنده‌ی مستقل پروژه عمل کند.
وظایف:
- خواندن Repository
- فهمیدن معماری فعلی
- بررسی آخرین تغییرات
- اجرای Testها
- پیدا کردن Bug
- پیاده‌سازی Feature
- Fix کردن Error
- بررسی کد Claude
- Refactor در صورت نیاز
- بررسی Regression
- ثبت تغییرات در Git
- به‌روزرسانی State

---

## 6. قانون مهم Claude و Codex
کاربر نباید واسطه‌ی انتقال اطلاعات بین Claude و Codex باشد.

```
وضعیت اشتباه:
Claude: کارم تمام شد.
User: Codex، Claude این کارها را انجام داده...

وضعیت صحیح:
Claude ──► GitHub + Project State ──► Codex ──► GitHub + Project State ──► Claude
```

---

## 7. Project State
برای جلوگیری از وابستگی به Chat History باید یک سیستم دائمی برای وضعیت پروژه ساخته شود:
```
/
├── README.md
├── PROJECT_STATE.md
├── TASKS.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── CHANGELOG.md
├── AGENTS.md
├── CLAUDE.md
├── CODEX.md
├── PROJECT_HANDOFF.md
└── project-state.json
```

---

## 8. PROJECT_STATE.md
این فایل مهم‌ترین فایل Context پروژه است و باید به این پرسش پاسخ دهد: «پروژه الان کجاست؟»
شامل: Current Phase, Overall Progress, Completed, In Progress, Blocked, Known Bugs, Last Major Change, Current Risks, Next Recommended Step, Human Decisions Required.

---

## 9. TASKS.md
تمام کارهای پروژه باید قابل ردیابی باشند.
بخش‌ها: Completed, In Progress, Planned, Blocked, Technical Debt.
AI نباید کار موجود را مجدداً ایجاد کند.

---

## 10. ARCHITECTURE.md
معماری واقعی پروژه شامل Frontend, Backend, Database, Authentication, Authorization, API, State Management, File Structure, Deployment.

---

## 11. DECISIONS.md
تمام تصمیمات مهم معماری با فرمت ADR (Decision, Reason, Status, Date) ثبت می‌شوند تا بدون دلیل لغو نشوند.

---

## 12. CHANGELOG.md
ثبت نسخه‌ها با دسته‌بندی Added, Changed, Fixed, Security.

---

## 13. AGENTS.md
قوانین مشترک ۱۴ گانه برای تمام AI Agentها:
1. قبل از تغییر کد، پروژه را تحلیل کن.
2. فایل‌های مرتبط را بررسی کن.
3. کد سالم را بی‌دلیل بازنویسی نکن.
4. قابلیت‌های موجود را حفظ کن.
5. Architecture فعلی را بدون دلیل تغییر نده.
6. قبل از تغییرات بزرگ، تأثیر آن را بررسی کن.
7. Testها را اجرا کن.
8. Error واقعی را بررسی کن.
9. حدس نزن؛ از Repository و ابزارها Evidence بگیر.
10. بعد از تغییر، Project State را به‌روزرسانی کن.
11. تغییرات مهم را ثبت کن.
12. اگر تصمیم Business لازم است، از کاربر سؤال کن.
13. اگر مشکل فنی قابل‌حل است، بدون سؤال غیرضروری آن را حل کن.
14. وضعیت پروژه را همیشه قابل بازیابی نگه دار.

---

## 14-15. CLAUDE.md & CODEX.md
دستورالعمل‌ها و فرآیندهای کاری ویژه برای Claude و Codex بر مبنای خودآگاهی و استقلال از حافظه چت.

---

## 16-18. Autonomous Project Awareness & Proactive Reporting
- AI خودش وضعیت را تشخیص دهد و منتظر سؤال کاربر نماند.
- گزارش‌دهی پیشگیرانه در صورت کشف باگ یا ریسک امنیتی.
- تفکیک تصمیمات بیزنسی (نیازمند کاربر) از تصمیمات فنی (حل مستقیم با Evidence).

---

## 19-21. MCP & Secret Management
- دسترسی بر مبنای Least Privilege.
- عدم Commit هرگونه Token، Password، API Key، Private Key در Git.
- استفاده از `.env` و `.gitignore`.

---

## 22-25. Git Workflow & Review
- Branching: `main`, `develop`, `feature/*`, `fix/*`, `hotfix/*`.
- Commit Strategy: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `security:`.
- Code Review: Functional, Regression, Security, Performance, Architecture, Maintainability.

---

## 26-29. Audits, Testing & Responsive Design
- ممیزی مستمر Build, Lint, Type Check, Dependencies.
- آزمون‌های Unit, Integration, API, Auth, Role, UI, Regression.
- Mobile First UI (Mobile, Tablet, Desktop).

---

## 30-39. منطق اصلی Manto Moda
- کاربران: Regular Customer, Wholesale Customer (با تایید ادمین), Admin.
- محافظت از قیمت عمده: **UI Security ≠ Real Security** (کنترل سطح دسترسی در Backend و API).
- کاتالوگ محصولات: تصویر، نام، مشخصات، سایز، رنگ، موجودی، قیمت خرده، قیمت عمده، SKU.
- جستجو و فیلتر: دسته‌بندی، قیمت، رنگ، سایز، موجودی، مرتب‌سازی.
- سبد خرید: مدیریت اقلام، محاسبه جمع، اعتبارسنجی قیمت و موجودی در سمت سرور.
- سفارش‌ها و پرداخت: مدیریت چرخه‌حیات سفارش (Pending, Confirmed, Processing, Shipped, Delivered, Cancelled).
- پنل ادمین: مدیریت محصولات، کاتالوگ، تایید خریداران عمده، کاربران، سفارش‌ها، گزارشات.

---

## 40-47. پایگاه داده، معماری، لاگ و Production
- بهینه‌سازی اسکما، ایندکس‌ها، محدودیت‌ها و Migration.
- استفاده مجدد از کامپوننت‌ها (`Reuse > Duplicate`).
- مدیریت جامع خطاها و لاگ‌های امن بدون افشای داده‌های حساس.
- چک‌لیست Production و استراتژی Backup & Recovery.

---

## 48-52. فرآیند Session کاری و Handoff
- چرخه ۱۹ مرحله‌ای در هر Session از تحلیل تا تست، داکیومنت و Commit.
- Handoff بدون واسطه بین Claude و Codex از طریق Git و State.

---

## 53-57. سلسله‌مراتب Source of Truth و ضد توهم (Anti-Hallucination)
- اولویت: `Actual Code > DB Schema > Git History > PROJECT_STATE.md > Docs > Tasks > Conversation`.
- قانون Evidence > Assumption (ادعای تست بدون اجرای واقعی ممنوع است).
- تحلیل ریسک قبل از تغییرات خطرناک و جلوگیری از Scope Creep.

---

## 58-62. قابلیت Machine-Readable و خودکارسازی کامل
- استفاده از `project-state.json` در کنار Markdown.
- فایل `PROJECT_HANDOFF.md` برای انتقال سریع به مدل‌های دیگر.

---

## 63-70. تقسیم نقش، تعاریف Done و قانون طلایی
- **Definition of Done**: فهم نیاز + تحلیل کد + پیاده‌سازی + تست + بررسی رگرسیون + امنیت + مستندسازی + آپدیت State + کامیت.
- **Definition of Production Ready**: تمام بخش‌های اصلی، امنیت، رل‌ها، پنل‌ها، تست‌ها و استقرار آماده باشند.
- **قانون طلایی**: سیستم مهندسی نرم‌افزار متکی به هوش مصنوعی با مرجعیت GitHub و Project State دائمی.
