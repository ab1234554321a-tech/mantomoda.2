# TECH_DEBT.md — Technical Debt Registry

This registry documents known technical debt, architectural compromises, and planned refactorings for the **Manto Moda** platform.

---

| ID | Title | Area | Cost | Risk | Benefit of Fixing | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TD-001** | In-Memory Data Store to Persistent PostgreSQL | Database | Medium | Medium | Persistent storage across container restarts, multi-instance horizontal scaling | **High** |
| **TD-002** | Pluggable Payment Gateway Provider Adapter | Payments | Low | Low | Real transactional checkout via Iranian banking network (Zarinpal / Saman) | **Medium** |
| **TD-003** | SMS OTP Mobile Verification on Register | Auth | Low | Low | Prevention of fake account generation, higher merchant verification trust | **Medium** |
| **TD-004** | Redis Caching Layer for Catalog & Categories | Performance | Low | Low | Sub-5ms response time under 10,000+ concurrent catalog visitors | **Low** |
| **TD-005** | React Server Components / Next.js Migration | Frontend | High | Low | Server-side rendering (SSR) for advanced SEO optimization | **Low** |
