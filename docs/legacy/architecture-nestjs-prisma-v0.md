> ⚠️ **تصميم مهجور — للاطلاع التاريخي فقط.**
>
> هذا المستند يصف نسخة سابقة من المعمارية تفترض NestJS وPrisma وNeon، وثلاثة تطبيقات بينها موقع عام.
> المرجع المعتمد الآن هو [PLAN.md](../../PLAN.md): Express 5 وDrizzle وPostgreSQL على VPS، والموقع العام خارج النسخة الأولى.
>
> يبقى مفيدًا لاحقًا في: عقد `GET /api/map/initiatives`، رسم `GreenMap.tsx`، واستراتيجية SEO وISR عند بناء الموقع العام.

---
# Green Cities — Application & API Architecture (v1)

> Monorepo-by-convention: three sibling apps, no shared runtime. Types are shared by **generated code**, not by imports.
> Root additions: `package.json` (npm workspaces, optional), `.env.example`, `README.md`.

---

## 0. Cross-cutting decisions (read first)

| Concern | Decision |
|---|---|
| Contract sharing | NestJS emits `openapi.json` → each frontend runs `npm run gen:api` (`openapi-typescript`) into `lib/api/types.gen.ts`. No cross-folder imports, no path aliases across apps. |
| Enum labels | **Never** from DB. Frozen enum values → `lib/i18n/dictionaries/{ar,en}.ts` → `enums.PartnershipType.STRATEGIC = "شريك استراتيجي"`. Adding a value = migration + dictionary edit, both apps. |
| Decimal | Backend DTO layer converts `Decimal` → `number` (`.toNumber()`) before serialization. No `Decimal.js` object ever crosses the wire or reaches a Client Component. |
| Auth transport | Access JWT (15 min, in memory) + refresh token (httpOnly, `SameSite=Lax`, path `/api/auth`). `Session.refreshTokenHash` = SHA-256. `tokenVersion` bump = instant global revoke. |
| Public site auth | None. The public site is anonymous-only; every logged-in surface (admin **and partner**) lives in GreenAdminDash. This keeps the public app fully cacheable. |
| Cache invalidation | Backend fires `POST {SITE_URL}/api/revalidate` with `x-revalidate-secret` + `{tags:[...]}` on publish/consent/impact changes. |
| RTL | `dir="rtl"` on `<html>`; Tailwind **logical utilities only** (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`). `tailwind.config` → `theme.fontFamily.sans` = IBM Plex Sans Arabic via `next/font/local`. |

---

## 1. `GreenWebsite/` — public Next.js App Router

### 1.1 Tree

```
GreenWebsite/
├─ app/
│  ├─ [locale]/                          # generateStaticParams → ['ar'] in v1, ['ar','en'] later
│  │  ├─ layout.tsx                      # <html lang={locale} dir={locale==='ar'?'rtl':'ltr'}>
│  │  ├─ page.tsx                        # /            الرئيسية
│  │  ├─ opengraph-image.tsx             # site-wide OG (ImageResponse, Arabic font subset)
│  │  ├─ not-found.tsx  error.tsx  loading.tsx
│  │  │
│  │  ├─ (marketing)/                    # shared editorial layout (hero + breadcrumbs)
│  │  │  ├─ about/page.tsx               # /about        من نحن · فريق إيفا
│  │  │  ├─ charter/
│  │  │  │  ├─ page.tsx                  # /charter      الميثاق (CharterVersion.isCurrent)
│  │  │  │  └─ opengraph-image.tsx
│  │  │  ├─ partners/
│  │  │  │  ├─ page.tsx                  # /partners     جدار الشركاء (consent-gated)
│  │  │  │  └─ [slug]/
│  │  │  │     ├─ page.tsx               # /partners/:slug
│  │  │  │     └─ opengraph-image.tsx
│  │  │  ├─ initiatives/
│  │  │  │  ├─ page.tsx                  # /initiatives  (static page 1 + client filters)
│  │  │  │  └─ [slug]/
│  │  │  │     ├─ page.tsx               # /initiatives/:slug  ⭐ most SEO-critical
│  │  │  │     ├─ opengraph-image.tsx
│  │  │  │     └─ loading.tsx
│  │  │  ├─ cities/[slug]/page.tsx       # SEO facet route (crawlable city filter)
│  │  │  ├─ reports/
│  │  │  │  ├─ page.tsx                  # /reports      (visibility = PUBLIC only)
│  │  │  │  └─ [slug]/page.tsx
│  │  │  └─ legal/{privacy,terms}/page.tsx
│  │  │
│  │  ├─ (engage)/                       # form layout: narrow column, no sidebar
│  │  │  ├─ join/page.tsx                # /join         انضم كشريك  (JoinRequestKind.PARTNERSHIP)
│  │  │  ├─ volunteer/page.tsx           # /volunteer    تطوّع معنا  (JoinRequestKind.VOLUNTEER)
│  │  │  ├─ contact/page.tsx             # /contact      اتصل بنا
│  │  │  └─ thanks/[ref]/page.tsx        # publicRef confirmation (JR-2026-000123)
│  │  │
│  │  └─ (map)/
│  │     └─ map/page.tsx                 # /map  full-bleed layout, no footer
│  │
│  ├─ api/
│  │  ├─ revalidate/route.ts             # POST, x-revalidate-secret → revalidateTag()
│  │  ├─ forms/[kind]/route.ts           # BFF proxy: Turnstile verify + rate-limit + forward
│  │  └─ health/route.ts
│  │
│  ├─ sitemap.ts                         # generateSitemaps() → index + per-entity shards
│  ├─ robots.ts
│  ├─ manifest.ts
│  └─ globals.css                        # Tailwind + .leaflet-container{direction:ltr}
│
├─ components/
│  ├─ ui/            Button Card Badge Dialog Tabs Skeleton EmptyState Pagination
│  ├─ layout/        SiteHeader SiteFooter LangSwitcher Breadcrumbs SkipLink
│  ├─ seo/           JsonLd.tsx (Organization, Event, Article, BreadcrumbList)
│  ├─ home/          HeroSection ImpactCounters FeaturedInitiatives PartnerStrip
│  ├─ initiatives/   InitiativeCard InitiativeGrid FilterBar(client) ImpactStats
│  │                 BeforeAfterSlider(client) Gallery(client) UpdateTimeline
│  ├─ partners/      PartnerWall PartnerLogo(consent-gated) PartnershipBadges
│  ├─ charter/       PrincipleGrid CommitmentList CharterDownload
│  ├─ map/           MapClient.tsx(dynamic ssr:false) GreenMap.tsx MapFilters
│  │                 MapLegend InitiativePopup MapListFallback(SSR, crawlable)
│  └─ forms/         JoinPartnerForm VolunteerForm ContactForm FormField Turnstile
│
├─ lib/
│  ├─ api/           client.ts (typed fetch + next.tags) · types.gen.ts · endpoints.ts
│  ├─ i18n/          config.ts · dictionaries/{ar,en}.ts (incl. enums) · getDictionary.ts
│  ├─ seo/           metadata.ts (defaults, metadataBase, alternates) · jsonld.ts
│  ├─ format.ts      dates (Asia/Damascus), numbers, ar-numeral toggle
│  ├─ arabic.ts      normalizeArabic() — mirrors backend searchName rules
│  ├─ env.ts         zod-validated NEXT_PUBLIC_* + server secrets
│  └─ constants.ts   SYRIA_BOUNDS, DEFAULT_CENTER=[34.80,38.99], TILE_URL
│
├─ public/{fonts,icons,images}/
├─ middleware.ts     locale negotiation only (ar = no prefix, en = /en)
├─ next.config.mjs   images.remotePatterns (Cloudinary), redirects
└─ tailwind.config.ts
```

### 1.2 Rendering strategy

| Route | Mode | `revalidate` / tag | Why |
|---|---|---|---|
| `/` | ISR | 300 · `home`,`impact` | Counters move; SEO landing must be pre-rendered. |
| `/about` | Static | 3600 · `settings` | Near-immutable editorial. |
| `/charter` | ISR | 3600 · `charter` | Changes only on `CharterVersion` publish; on-demand tag. |
| `/partners` | ISR | 600 · `partners` | Consent withdrawal must drop a logo fast → on-demand revalidate on consent event. |
| `/partners/[slug]` | SSG + ISR | `generateStaticParams` = ACTIVE + `publicNameConsent`; `dynamicParams=true`, 600 | Crawlable partner pages; new partners render on first hit. |
| `/initiatives` | ISR (page 1) | 300 · `initiatives` | First page pre-rendered for crawlers; **filters/pagination are client-side fetches** — never put filters in `searchParams` of this page or it goes dynamic. |
| `/cities/[slug]` | SSG + ISR | 600 | Crawlable facet replacing `?city=` for SEO. |
| `/initiatives/[slug]` | SSG + ISR | `generateStaticParams` = PUBLISHED; 600 · `initiative:<slug>` | Primary SEO surface. `firstPublishedAt` → sitemap `lastmod`. |
| `/reports`, `/reports/[slug]` | ISR | 900 · `reports` | Public reports only; partner-scoped reports live in the dashboard. |
| `/map` | **Static shell + CSR data** | shell static; data from `/api/map/initiatives` (`s-maxage=300`) | Leaflet needs `window`; map data is filter-combinatorial and uncacheable per-page. Ship `MapListFallback` server-rendered so the pins' content is crawlable. |
| `/join`, `/volunteer`, `/contact` | Static shell + client form | — | Forms POST to `/api/forms/[kind]` (Next Route Handler) which verifies Turnstile, rate-limits by IP, and forwards server-side with `X-Api-Key`. Backend URL/secret never reach the browser. |
| `/thanks/[ref]` | `force-dynamic` | `noindex` | Per-submission. |

### 1.3 SEO placement

- **Per-route** `generateMetadata()` → title/description from `metaTitleAr` / `metaDescriptionAr`, falling back to `titleAr` / `summaryAr`. `alternates.canonical` + `alternates.languages` only when `*En` exists.
- **`app/[locale]/layout.tsx`**: `metadataBase`, `openGraph.locale = 'ar_SY'`, `twitter.card`, default OG.
- **OG images**: co-located `opengraph-image.tsx` (`ImageResponse`, edge runtime, `size 1200×630`) at site root, `/charter`, `/partners/[slug]`, `/initiatives/[slug]`. Must embed an Arabic font `ArrayBuffer` — the default Satori font renders Arabic as boxes.
- **`app/sitemap.ts`**: `generateSitemaps()` → shards `initiatives-0`, `partners-0`, `cities-0`, `reports-0`, `static`. `lastmod` = `updatedAt`.
- **JSON-LD**: `Organization` (root), `BreadcrumbList` (all), `Event` (`InitiativeEvent`), `Article` (`InitiativeUpdate`), `Place`+`geo` (initiative with coords).

---

## 2. `GreenAdminDash/` — admin + partner portal

### 2.1 Recommendation: **separate Next.js app** (keep the existing folder)

| Reason | Detail |
|---|---|
| Cache model conflict | Public site is ISR/CDN-cached and anonymous. A `(admin)` group inside it forces `middleware` auth checks on every public request and risks a cached authenticated page. |
| Bundle | Tables, charts, rich-text editor, map picker, PDF preview ≈ 300–500 KB that must never ship on `/initiatives/[slug]`. |
| Deploy cadence | Volunteers iterate on the dashboard weekly; the public site should not redeploy (and lose its ISR cache) each time. |
| Cookie scope | `admin.greencities.sy` gets its own refresh cookie domain; a public-site XSS cannot reach it. |
| Given layout | The folder already exists and is the stated intent — don't fight it. |

**Trade-off:** duplicated UI primitives. Mitigation: copy `components/ui/*` once (≈10 files, no logic), and share only generated API types. Do **not** build a shared component package for v1.

Config: `output: 'standalone'`, `robots: noindex, nofollow`, every dashboard page `export const dynamic = 'force-dynamic'`, no ISR anywhere.

### 2.2 Tree

```
GreenAdminDash/app/
├─ (auth)/                       login · forgot-password · reset-password/[token]
│                                accept-invite/[token]      # Invitation → User + PartnerContact
├─ (dashboard)/                  layout.tsx = Sidebar + RoleGate + TopBar; RTL
│  ├─ page.tsx                                              # overview KPIs
│  ├─ partners/
│  │  ├─ page.tsx                                           # list · status · types · tier
│  │  ├─ new/page.tsx
│  │  └─ [id]/
│  │     ├─ page.tsx  edit/  partnerships/                  # add/approve/pause/end (EVENT→initiative)
│  │     ├─ contacts/                                       # PartnerContact + capabilities
│  │     ├─ consent/                                        # name/logo grant + withdraw log
│  │     ├─ charter/                                        # acknowledgements (append-only)
│  │     └─ activity/                                       # AuditLog partnerVisible
│  ├─ charter/                   versions/ · versions/[id] · acknowledgements/
│  ├─ meetings/                  page · [id]/attendance     # PartnerMeetingAttendance
│  ├─ initiatives/
│  │  ├─ page.tsx  new/
│  │  └─ [id]/{content,location,media,before-after,partners,events,updates,impact,publish}/
│  ├─ join-requests/             page.tsx (inbox: kind/status/assignee)
│  │                             [id]/{page,review,approve}/   # approve wizard → Partner|Volunteer
│  ├─ volunteers/
│  │  ├─ page.tsx  [id]/  merge/                            # duplicate merge
│  │  ├─ applications/                                       # accept · waitlist · reject
│  │  └─ attendance/                                         # bulk check-in per event/day
│  ├─ impact/                    metrics/ (catalog) · entries/ (ledger + reversal)
│  ├─ reports/                   page · new · [id] (status, snapshot, PDF, grants)
│  ├─ media/                     library · upload
│  ├─ messages/                  contact inbox · convert-to-join-request
│  ├─ users/                     page · invitations/ · [id]
│  ├─ settings/                  general · contact · social · seo · map
│  └─ audit-log/
└─ (partner)/                    # PARTNER_USER only — middleware role gate
   ├─ layout.tsx                 # PartnerScope banner: org name + capability chips
   ├─ page.tsx  my-org/  display-consent/  contacts/
   ├─ initiatives/               # my initiatives; updates (PUBLISH_UPDATES), media (UPLOAD_MEDIA)
   ├─ impact/submit/             # SUBMIT_IMPACT
   ├─ field-log/                 # LOG_FIELD_ACTIVITY → Participation
   ├─ reports/                   # VIEW_SCOPED_REPORTS → signed download
   └─ meetings/
```

`middleware.ts`: `SUPER_ADMIN|ADMIN|EDITOR → /(dashboard)`, `PARTNER_USER → /(partner)`, `VOLUNTEER → 403`. Server-side capability checks are **re-done in the API** — the middleware is UX only.

---

## 3. `GreenBackend/` — API

### 3.1 Framework: **Express 5 + Drizzle ORM**

The API runs on Node.js and TypeScript with Express 5. Feature modules keep each route, controller, service, and validation schema together. Shared security and request concerns stay under `src/common/` and are mounted before feature routes in `src/app.ts`.

Drizzle ORM is the only active database layer. PostgreSQL is accessed through `node-postgres`; `DATABASE_URL` selects the local or VPS database without changing application code. Zod validates environment variables now and remains the validation language for request contracts.

### 3.2 Tree

```
GreenBackend/
├─ drizzle/                 generated, reviewed SQL migrations
├─ deploy/                  VPS environment and deployment examples
├─ src/
│  ├─ app.ts                Express middleware and route composition
│  ├─ server.ts             database startup check and graceful shutdown
│  ├─ config/               validated environment variables (Zod)
│  ├─ db/
│  │  ├─ client.ts          the shared Drizzle/node-postgres pool
│  │  └─ schema/            Drizzle table definitions, split by domain
│  ├─ common/
│  │  ├─ errors/            typed application errors
│  │  ├─ middleware/        request-id · auth · RBAC · error handler · rate limits
│  │  └─ utils/             cursor-pagination · arabic-normalize · slugify-ascii · public-ref
│  ├─ modules/
│  │  ├─ health/            liveness and PostgreSQL readiness
│  │  └─ {feature}/         feature.routes · controller · service · schema
│  ├─ routes/               top-level `/api` router
│  └─ types/                shared TypeScript declarations
├─ test/                    API and integration tests
├─ compose.local.yml        optional isolated local PostgreSQL
├─ drizzle.config.ts
└─ .env.example
```

**Placement answers:** Drizzle client and pool → `src/db/client.ts` (one shared pool). RBAC → `src/common/middleware/`. Zod → per-module `*.schema.ts`. PDF → `src/modules/reports/pdf/`.

### 3.3 Endpoints

Auth legend: 🌐 public · 🔒 any authenticated · **SA/AD/ED** = SUPER_ADMIN / ADMIN / EDITOR · **P:CAP** = `PARTNER_USER` + partner scope + capability · ⏱ rate-limited · 🤖 `x-cron-secret`

**Auth**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | 🌐⏱ | Access JWT + refresh cookie; creates `Session`; increments `failedLoginCount`/`lockedUntil` on failure |
| POST | `/api/auth/refresh` | cookie | Rotate refresh (hash compare + `tokenVersion` check) |
| POST | `/api/auth/logout` / `/logout-all` | 🔒 | Revoke session / bump `tokenVersion` |
| GET | `/api/auth/me` | 🔒 | user + role + `{partnerId, partnerRole, capabilities}` |
| POST | `/api/auth/forgot-password` | 🌐⏱ | `VerificationToken(PASSWORD_RESET)` — always 202, never leaks existence |
| POST | `/api/auth/reset-password` | 🌐 + token | Consume token, set `passwordChangedAt`, revoke all sessions |
| GET | `/api/auth/invitations/:token` | 🌐 | Preview invite (email, role, partner name) |
| POST | `/api/auth/invitations/:token/accept` | 🌐 | Tx: create `User` + `PartnerContact` + link `resultingPartnerContactId` |

**Partners**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/partners` | 🌐 | Wall. Filter: `ACTIVE ∧ suspendedAt IS NULL ∧ publicNameConsent ∧ ¬revoked ∧ ¬hiddenFromWall`. Sort `wallTier, displayOrder` |
| GET | `/api/partners/:slug` | 🌐 | Profile; `logo` returned **only** if `publicLogoConsent`; badges from `public_partner_badges` view |
| GET | `/api/admin/partners` | AD | Full list incl. `PROSPECT`, `internalNotes`, account manager |
| POST · PATCH | `/api/admin/partners[/:id]` | AD | Create / edit |
| POST | `/api/admin/partners/:id/partnerships` | AD | Add a type; `EVENT` ⇒ `initiativeId` required |
| PATCH | `/api/admin/partners/:id/partnerships/:pid` | AD | Approve / pause / end (sets `approvedById`, `approvedAt`) |
| POST | `/api/admin/partners/:id/consent` | AD | Tx: append `PartnerConsentEvent` **and** mirror `public*Consent*` columns |
| POST | `/api/admin/partners/:id/{suspend,restore}` | AD | Independent suspension axis |
| GET · PATCH | `/api/partner/me` | P / P:MANAGE_ORG_PROFILE | Whitelisted fields only — no `status`, `wallTier`, `internalNotes` |
| PATCH | `/api/partner/me/display-consent` | P:MANAGE_DISPLAY_CONSENT | Self-serve grant/withdraw name & logo |
| GET | `/api/partner/me/activity` | P | `AuditLog` where `partnerVisible = true` |
| GET | `/api/charter` | 🌐 | Current version + principles + PDF |
| POST | `/api/admin/partners/:id/charter-acknowledgements` | AD | Append-only ack (explicit `acknowledgedAt`, snapshots) |

**Initiatives**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/initiatives` | 🌐 | Published list; cursor pagination; filters city/gov/category/status/year/`q` |
| GET | `/api/initiatives/:slug` | 🌐 | Detail + gallery + before/after + consented partners + updates + impact |
| GET | `/api/initiatives/:slug/updates` · `/events` | 🌐 | Timeline / event list |
| GET | `/api/impact/summary` | 🌐 | Homepage counters from `v_impact_totals` |
| GET | `/api/geo/{governorates,cities}` | 🌐 | Reference lists |
| POST · PATCH | `/api/admin/initiatives[/:id]` | AD·ED | CRUD (draft) |
| POST | `/api/admin/initiatives/:id/{publish,schedule,archive}` | AD | Publish gate: requires coords when `mapPinVisible`; sets `firstPublishedAt` once |
| DELETE | `/api/admin/initiatives/:id` | AD | Soft delete — one tx: reverse `ImpactEntry`, null media refs, recompute counters |
| PUT | `/api/admin/initiatives/:id/{media,before-after,partners,categories}` | AD·ED | Ordered sub-collections |
| POST | `/api/admin/initiatives/:id/impact` | AD | Ledger entry (`ADMIN_ENTRY`) |
| POST | `/api/admin/impact/entries/:id/reverse` | AD | Correction = reversing entry, never UPDATE |
| POST | `/api/partner/initiatives/:id/updates` | P:PUBLISH_UPDATES | Draft update on a scoped initiative |
| POST | `/api/partner/initiatives/:id/impact` | P:SUBMIT_IMPACT | `ImpactEntry(source = PARTNER_SUBMISSION)` |

**Map**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/map/initiatives` | 🌐 | GeoJSON pins — full contract in §4 |
| GET | `/api/map/cities` | 🌐 | `{slug, nameAr, centerLat, centerLng, defaultZoom, count}` for the city fly-to selector |

**Join requests**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/join-requests` | 🌐⏱ + Turnstile | Volunteer **or** partnership; returns `publicRef` only |
| GET | `/api/admin/join-requests` | AD | Inbox: kind, status, assignee, city, SLA (`firstResponseAt`) |
| GET | `/api/admin/join-requests/:id` | AD | Detail + `JoinRequestEvent` trail |
| PATCH | `/api/admin/join-requests/:id/assign` | AD | Set `assignedToId` |
| POST | `/api/admin/join-requests/:id/events` | AD | Note / contacted / meeting-held / doc-requested |
| POST | `/api/admin/join-requests/:id/approve` | AD | **Tx**: create `Partner` + one `PartnerPartnership` per approved type (or `VolunteerProfile`), set `resulting*Id`, snapshot `approvedPartnershipTypes`, emit `PARTNER_CREATED` |
| POST | `/api/admin/join-requests/:id/reject` | AD | `rejectionReasonAr` (public) vs `decisionNoteAr` (internal) |

**Volunteers**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/volunteer-applications` | 🌐⏱ | Apply to initiative/event; matches or creates `VolunteerProfile` |
| GET · PATCH | `/api/admin/volunteers[/:id]` | AD | Profiles (minors flagged; `isMinor = null` blocks field assignment) |
| POST | `/api/admin/volunteers/:id/merge` | AD | Set `mergedIntoId`; never delete |
| POST | `/api/admin/volunteers/:id/consent` | AD | `VolunteerConsentEvent` |
| POST | `/api/admin/volunteers/:id/anonymize` | SA | Redact profile + applications + participations |
| GET · PATCH | `/api/admin/volunteer-applications[/:id/decision]` | AD | Accept / waitlist / reject |
| POST | `/api/admin/participations` `·/bulk-checkin` | AD | Attendance + hours |
| PATCH | `/api/admin/participations/:id/verify` | AD | Sets `verifiedById`; triggers counter recompute |
| POST | `/api/partner/participations` | P:LOG_FIELD_ACTIVITY | Field log on scoped initiatives only |

**Reports**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET · GET | `/api/reports[/:slug]` | 🌐 | `visibility = PUBLIC ∧ publishedAt ∧ ¬archivedAt` |
| GET | `/api/partner/reports` | P:VIEW_SCOPED_REPORTS | Union: `SCOPED_PARTNER(mine)` ∪ `ALL_PARTNERS` ∪ `INITIATIVE_PARTNERS(my initiatives)` ∪ active grants |
| GET | `/api/partner/reports/:id/download` | P:VIEW_SCOPED_REPORTS | 302 → signed URL, TTL 120 s, audited |
| GET · POST · PATCH | `/api/admin/reports[/:id]` | AD | CRUD |
| POST | `/api/admin/reports/:id/generate` | AD | `status = QUEUED` (idempotent; no inline PDF work) |
| POST | `/api/admin/reports/:id/publish` | AD | Guard: partner-scoped ⇒ visibility ∈ {INTERNAL, SCOPED_PARTNER} |
| POST · DELETE | `/api/admin/reports/:id/grants[/:gid]` | AD | Explicit exceptions |

**Uploads & media**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/uploads/sign` | ED / P:UPLOAD_MEDIA | Signed Cloudinary params scoped to folder + kind + max bytes; never proxies bytes |
| POST | `/api/media` | ED / P:UPLOAD_MEDIA | Persist `MediaAsset` after direct upload; `altAr` required for `IMAGE`/`LOGO` |
| PATCH · DELETE | `/api/media/:id` | ED | Edit alt/caption; soft delete rejected if asset is in a `BeforeAfterPair` |
| GET | `/api/admin/media` | ED | Library (cursor, kind filter) |

**System**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/contact` | 🌐⏱ + Turnstile | `ContactMessage` |
| GET · PATCH | `/api/admin/contact-messages[/:id]` | AD | Inbox |
| POST | `/api/admin/contact-messages/:id/convert` | AD | → `JoinRequest`, links `convertedJoinRequestId` |
| GET | `/api/settings/public` | 🌐 | `SiteSetting where isPublic` |
| GET | `/api/admin/audit-logs` | SA | Append-only trail |
| POST | `/api/internal/cron/{purge-pii,publish-scheduled,expire-sessions,recompute-counters,reports-worker}` | 🤖 | Vercel Cron (Neon has no `pg_cron`) |

---

## 4. `GET /api/map/initiatives` — exact contract

### Query parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `bbox` | `minLng,minLat,maxLng,maxLat` | none = all Syria | Floats. Rejected (`400`) if outside `lng 35.5–42.5`, `lat 32.0–37.5`. Anti-meridian not supported. |
| `zoom` | int 3–18 | `7` | Drives precision downgrade + `limit` ceiling. |
| `city` | csv of city slugs | — | OR-combined. |
| `governorate` | csv of governorate slugs | — | OR-combined; AND-ed with `city`. |
| `category` | csv of category slugs | — | |
| `status` | csv of `InitiativeStatus` | all | |
| `from` / `to` | `YYYY-MM-DD` | — | Range on `startDate`. |
| `partner` | partner slug | — | Initiatives with `InitiativePartner` **or** EVENT `PartnerPartnership` for that partner. |
| `featured` | bool | — | `isFeatured`. |
| `hasBeforeAfter` | bool | — | Has ≥1 `BeforeAfterPair`. |
| `q` | string ≤ 80 | — | Arabic-normalized `pg_trgm` on `search_name`. |
| `limit` | int 1–2000 | `500` | |
| `fields` | `lite` \| `full` | `lite` | `lite` omits `summaryAr`, `coverUrl`. |

**Server-enforced filter (non-negotiable):** `publishStatus = 'PUBLISHED' ∧ deletedAt IS NULL ∧ mapPinVisible = true ∧ lat IS NOT NULL ∧ lng IS NOT NULL`.

**Coordinate policy by `locationPrecision`:** `EXACT` → as stored · `APPROXIMATE` → rounded to 3 dp (~110 m) · `CITY_ONLY` → replaced with `city.centerLat/Lng`. `properties.precision` always states which.

**Headers:** `Content-Type: application/geo+json; charset=utf-8` · `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` · `ETag` = hash of `(count, max(updatedAt), normalized query)`.

### Response (200)

```jsonc
{
  "type": "FeatureCollection",
  "bbox": [36.19, 33.45, 38.99, 36.21],          // bbox of returned features
  "meta": {
    "count": 128,
    "truncated": false,                           // true ⇒ limit hit, client should zoom in
    "limit": 500,
    "generatedAt": "2026-08-02T09:14:00.000Z",
    "totals": { "treesPlanted": 14320, "volunteersParticipated": 2870 },
    "filters": { "city": ["damascus"], "status": ["COMPLETED"] }
  },
  "features": [
    {
      "type": "Feature",
      "id": "clx8f2k9a0001qa3b7hs2u1zv",
      "geometry": { "type": "Point", "coordinates": [36.2765, 33.5138] },  // [lng, lat] — GeoJSON order
      "properties": {
        "slug": "tashjir-hadiqat-al-jahiz",
        "url": "/initiatives/tashjir-hadiqat-al-jahiz",
        "titleAr": "تشجير حديقة الجاحظ",
        "titleEn": "Al-Jahiz Park Greening",
        "summaryAr": "زراعة ٤٠٠ شجرة ضمن الحديقة العامة.",   // fields=full only
        "status": "COMPLETED",                                // label from FE dictionary
        "citySlug": "damascus",
        "cityNameAr": "دمشق",
        "governorateSlug": "sy-di",
        "governorateNameAr": "دمشق",
        "categorySlug": "tree-planting",
        "categoryNameAr": "تشجير",
        "categoryColor": "#2E7D32",
        "categoryIcon": "tree",
        "treesExpected": 400,
        "treesPlanted": 412,          // null = not measured yet, NOT zero
        "treesSurviving": 389,
        "volunteersParticipated": 63,
        "startDate": "2026-03-14",
        "endDate": "2026-03-16",
        "coverUrl": "https://res.cloudinary.com/.../w_480/cover.webp",  // fields=full only
        "coverAlt": "متطوعون يزرعون الأشجار في حديقة الجاحظ",
        "hasBeforeAfter": true,
        "isFeatured": false,
        "precision": "EXACT"          // EXACT | APPROXIMATE | CITY_ONLY
      }
    }
  ]
}
```

**Errors** (RFC-7807): `400 invalid_bbox` · `400 invalid_query` · `429 rate_limited`.

---

## 5. `GreenMap.tsx` sketch

**File 1 — `components/map/MapClient.tsx`** (the only thing pages import; `ssr:false` is illegal in a Server Component):

```tsx
'use client';
import dynamic from 'next/dynamic';
export default dynamic(() => import('./GreenMap'), {
  ssr: false,                                    // Leaflet touches window/document at import time
  loading: () => <div className="h-[70vh] w-full animate-pulse rounded-2xl bg-emerald-50" />,
});
```

**File 2 — `components/map/GreenMap.tsx`**:

```tsx
'use client';

import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/lib/assets/MarkerCluster.css';
import 'react-leaflet-cluster/lib/assets/MarkerCluster.Default.css';

import L, { LatLngBoundsExpression } from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';

/* ── 1. The bundler default-icon fix. Webpack/Turbopack rewrite the CSS-relative
      image paths, so Leaflet's internal _getIconUrl resolves to 404s. ────────── */
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetinaUrl.src,   // next/image static import → { src, width, height }
  iconUrl: iconUrl.src,
  shadowUrl: shadowUrl.src,
});

/* ── 2. Types = the GeoJSON from GET /api/map/initiatives ──────────────────── */
export type InitiativeProps = {
  slug: string; url: string; titleAr: string; cityNameAr: string;
  status: string; categoryColor: string | null;
  treesPlanted: number | null; treesExpected: number | null;
  precision: 'EXACT' | 'APPROXIMATE' | 'CITY_ONLY';
};
export type InitiativeFeature = {
  type: 'Feature'; id: string;
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
  properties: InitiativeProps;
};

const SYRIA_BOUNDS: LatLngBoundsExpression = [[32.0, 35.5], [37.5, 42.5]];

/* ── 3. Custom green tree pin (divIcon → no extra image request, themeable) ── */
const treeIcon = (color = '#2E7D32') =>
  L.divIcon({
    className: 'gc-pin',                       // keep empty-ish: Leaflet adds a white box otherwise
    iconSize: [34, 44], iconAnchor: [17, 44], popupAnchor: [0, -40],
    html: `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 44C17 44 32 26.5 32 17A15 15 0 1 0 2 17C2 26.5 17 44 17 44Z"
            fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <path d="M17 8l5 7h-3l4 6h-4v5h-4v-5h-4l4-6h-3z" fill="#ffffff"/>
    </svg>`,
  });

/* ── 4. Fit to the data; fly when a city is picked ────────────────────────── */
function MapBehaviour({ features, flyTo }: {
  features: InitiativeFeature[];
  flyTo: { lat: number; lng: number; zoom: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (flyTo) return;                          // an explicit city choice wins over auto-fit
    if (!features.length) { map.fitBounds(SYRIA_BOUNDS, { padding: [24, 24] }); return; }
    const bounds = L.latLngBounds(
      features.map((f) => L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0])),
    );
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 }); // maxZoom: 1 pin must not zoom to 18
  }, [features, flyTo, map]);

  useEffect(() => {
    if (flyTo) map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { duration: 0.8 });
  }, [flyTo, map]);

  return null;
}

export default function GreenMap({ features, flyTo = null }: {
  features: InitiativeFeature[];
  flyTo?: { lat: number; lng: number; zoom: number } | null;
}) {
  const icons = useMemo(() => new Map<string, L.DivIcon>(), []);
  const iconFor = (c: string | null) => {
    const key = c ?? '#2E7D32';
    if (!icons.has(key)) icons.set(key, treeIcon(key));   // memoize: one DivIcon per colour, not per pin
    return icons.get(key)!;
  };

  return (
    <MapContainer
      center={[34.8, 38.99]} zoom={7} minZoom={6} maxZoom={18}
      maxBounds={SYRIA_BOUNDS} maxBoundsViscosity={0.8}
      zoomControl={false} scrollWheelZoom
      className="h-[70vh] w-full rounded-2xl"
      /* .leaflet-container { direction: ltr } in globals.css — RTL inherits into the
         control bar and mirrors the zoom/attribution layout. Popups reset to rtl. */
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <ZoomControl position="topleft" />

      {/* react-leaflet-cluster wraps leaflet.markercluster; without it 500+ pins
          across 14 governorates render as an unreadable blob and drop frames. */}
      <MarkerClusterGroup chunkedLoading maxClusterRadius={56} showCoverageOnHover={false}>
        {features.map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          return (
            <Marker key={f.id} position={[lat, lng]} icon={iconFor(p.categoryColor)}
                    title={p.titleAr} alt={p.titleAr}>
              <Popup minWidth={220}>
                <div dir="rtl" className="text-end">
                  <h3 className="mb-1 text-sm font-bold">{p.titleAr}</h3>
                  <p className="mb-2 text-xs text-neutral-600">
                    {p.cityNameAr}
                    {p.precision === 'CITY_ONLY' && ' · موقع تقريبي'}
                  </p>
                  {p.treesPlanted != null && (
                    <p className="mb-2 text-xs">🌳 {p.treesPlanted.toLocaleString('ar-SY')} شجرة</p>
                  )}
                  <Link href={p.url} className="text-xs font-semibold text-emerald-700 underline">
                    عرض تفاصيل المبادرة ←
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>

      <MapBehaviour features={features} flyTo={flyTo} />
    </MapContainer>
  );
}
```

**Gotchas encoded above:** `ssr:false` must live in a Client Component (Next 15 forbids it in Server Components) · static PNG imports expose `.src`, not a string · `_getIconUrl` must be `delete`d before `mergeOptions` or the stale resolver wins · `maxZoom` on `fitBounds` prevents a single pin zooming to street level · icons memoized by colour, not created per marker · `.leaflet-container { direction: ltr }` is required under `dir="rtl"` (add `.leaflet-popup-content { direction: rtl }` back) · during HMR add `key={featuresHash}` on `MapContainer` if you hit *"Map container is already initialized"*.
