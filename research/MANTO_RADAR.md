# MANTO_RADAR.md — Continuous Technology & Trend Radar

**System**: Manto Moda Continuous Evolution & R&D Radar  
**Version**: 1.0.0  
**Last Updated**: 2026-09-04  
**Coverage**: 15 Core Engineering & Business Domains

---

## 🧭 Radar Framework & Categories
این سامانه وظیفه پایش و غربالگری مستمر تحولات و روندهای دنیای وب، هوش مصنوعی و تجارت الکترونیک را بر عهده دارد. هر ورودی دارای سطح اهمیت، شواهد و پیشنهاد عملیاتی است.

---

## 📡 Active Radar Findings & Decisions

### 1. SECURITY & AUTHENTICATION
- **Date**: 2026-09-04
- **Category**: Security
- **Importance**: HIGH
- **Evidence**: OWASP API Security Top 10 (API1:2023 Broken Object Level Authorization & Header Injection).
- **Impact on Manto Moda**: Header-based authentication (`x-user-id`) allows spoofing; non-cryptographic tokens permit session forgery.
- **Recommendation**: Enforce HMAC-SHA256 JWT tokens with bcrypt password hashing and rate limiting.
- **Status**: **RESOLVED / ADOPTED** (Commit `9e36b8e`)

---

### 2. PROTOCOL & AGENTS (MCP)
- **Date**: 2026-09-04
- **Category**: MCP / AI Agents
- **Importance**: HIGH
- **Evidence**: Anthropic Model Context Protocol (MCP) Specification (JSON-RPC 2.0 stdio).
- **Impact on Manto Moda**: CLI one-shot commands in `mcp.json` crash client tool calling; standard SDK allows Claude Code and Cursor to autonomously inspect database and run security gates.
- **Recommendation**: Build protocol-compliant MCP server with `@modelcontextprotocol/sdk`.
- **Status**: **RESOLVED / ADOPTED** (Commit `12e72e9`)

---

### 3. FASHION E-COMMERCE UX (DUAL PRICING)
- **Date**: 2026-09-04
- **Category**: E-Commerce / Business Logic
- **Importance**: CRITICAL
- **Evidence**: B2B Wholesale Market Study (Faire / Shopify B2B).
- **Impact on Manto Moda**: Retail shoppers seeing wholesale prices damages brand value; boutique buyers need instant bulk discounts.
- **Recommendation**: Strict backend Price Sanitization on all public routes + Wholesale application approval workflow (`ADR-002` & `ADR-003`).
- **Status**: **RESOLVED / ADOPTED**

---

### 4. DATA & DATABASE ARCHITECTURE
- **Date**: 2026-09-04
- **Category**: Database / Scalability
- **Importance**: MEDIUM
- **Evidence**: High-traffic concurrency bottlenecks on single-instance in-memory stores.
- **Impact on Manto Moda**: In-memory store is fast for prototyping and development, but production requires persistent PostgreSQL with connection pooling.
- **Recommendation**: Maintain Store pattern abstraction for smooth Prisma ORM drop-in (`BL-005`).
- **Status**: **WATCH / PLANNED FOR PHASE 9**

---

### 5. PERFORMANCE & WEB STANDARDS
- **Date**: 2026-09-04
- **Category**: Web Standards / Performance
- **Importance**: MEDIUM
- **Evidence**: Google Core Web Vitals 2026 (INP < 200ms, LCP < 2.5s).
- **Impact on Manto Moda**: Debounced search inputs and optimized responsive image aspect ratios prevent layout shifts and CPU spikes on mobile devices.
- **Recommendation**: Debounced search input (300ms) + explicit aspect ratio wrappers (`aspect-[3/4]`).
- **Status**: **ADOPTED**

---

### 6. DEPENDENCY / SUPPLY CHAIN
- **Date**: 2026-09-04
- **Category**: Dependencies
- **Importance**: HIGH
- **Evidence**: npm audit vulnerability reports on deep transitive dependencies.
- **Impact on Manto Moda**: Keeping dependencies lean and auditing with `npm audit` prevents malicious injection.
- **Recommendation**: Regular automated dependency scan skill (`skills/manto-radar.js`).
- **Status**: **ACTIVE / MONITORED**

---

## 🚫 Rejected Technologies & Trends Log (Anti-Hype)

| تاریخ | تکنولوژی / ترند | دلیل رد مستند (Evidence-Based Rejection) |
| :--- | :--- | :--- |
| ۲۰۲۶-۰۹ | **Microfrontends برای پروژه فعلی** | پیچیدگی معماری بیش از حد، افت سرعت لودینگ و نامتناسب با اسکیل تک‌تیمی. |
| ۲۰۲۶-۰۹ | **NoSQL / MongoDB برای تراکنش‌های مالی** | عدم تضمین ACID و ضعف در روابط ارجاعی پیچیده خریدار عمده، سفارشات و انبار. |
| ۲۰۲۶-۰۹ | **Blockchain برای رهگیری سفارشات** | هزینه غیرضروری، سرعت پایین و عدم ایجاد ارزش واقعی برای مشتری مانتو. |
