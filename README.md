# المدن الخضراء  — Green Cities

مشروع مجتمعي بيئي يقوده فريق إيفا لإعادة إحياء الغطاء النباتي في المدن السورية عبر شبكة من الشركاء والفرق الشبابية.

هذا المستودع يضم نظام التشغيل الداخلي للمشروع: إدارة الشراكات والمبادرات والمهام والأثر .

## المجلدات

| المجلد | الوصف | الحالة |
|---|---|---|
| `GreenBackend/` | واجهة API على Express 5 وDrizzle وPostgreSQL | المصادقة والصلاحيات والدعوات والشركاء والميثاق |
| `GreenAdminDash/` | لوحة فريق إيفا وبوابة الشركاء على Next.js 16 | الدخول وسجل الشركاء والميثاق والدعوات وبوابة الشريك |
| `GreenWebsite/` | الموقع العام على Next.js 16 | البنية والصفحات جاهزة — بانتظار مسارات `/api/public/*` |

## التشغيل محليًا

يلزم PostgreSQL 15 أو أحدث. هيّئ القاعدة مرة واحدة بحساب المدير:

```bash
psql -U postgres -f GreenBackend/scripts/setup-local-db.sql
```

ثم في طرفيتين منفصلتين:

```bash
cd GreenBackend && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev
```

```bash
cd GreenAdminDash && npm install && npm run dev
```

اللوحة على `http://localhost:3000` والـAPI على `4000`. اللوحة تمرّر `/api` إلى الـAPI فيبقيان على أصل واحد — وهو شرط عمل كوكي الجلسة.

الموقع العام مستقل عنهما على المنفذ `3001`، ولا يحتاج الـAPI ليعمل:

```bash
cd GreenWebsite && npm install && npm run dev
```

## المراجع

- [PLAN.md](PLAN.md) — الخطة المعتمدة ونموذج البيانات الديناميكي. **اقرأه أولًا.**
- [GreenBackend/README.md](GreenBackend/README.md) — تشغيل الـAPI محليًا والنشر.
- [GreenAdminDash/README.md](GreenAdminDash/README.md) — نشر اللوحة على Cloudflare Workers.
- [GreenWebsite/README.md](GreenWebsite/README.md) — الموقع العام وعقد مسارات `/api/public/*` المطلوبة.
- [docs/legacy/](docs/legacy/) — تصاميم مهجورة للاطلاع التاريخي فقط.

## المبدأ الحاكم

النظام عام لا مخصص لمبادرة واحدة. حملة 100 شجرة أول مبادرة تُشغَّل عليه، وليست القالب الذي بُني حوله. أي اسم مبادرة أو رقم هدف أو عدد مواقع أو اسم مؤشر يأتي من قاعدة البيانات لا من الكود.

## المساهمة

الفرع `main` محمي: لا يُدفع إليه مباشرة. اعمل على فرع وافتح طلب دمج.

بعد استنساخ المستودع، فعّل خطّافات Git مرة واحدة:

```bash
git config core.hooksPath .githooks
```

يمنع `pre-push` الدفع إلى `main` ويقترح إنشاء فرع بدلًا منه.

هذه حماية على الجهاز لا على الخادم: حماية فروع GitHub تحتاج خطة مدفوعة
على المستودعات الخاصة. فهي توقف الخطأ — الدفع في الفرع الخطأ — لا من
يعرف متغيّر التجاوز. وعند الضرورة القصوى:

```bash
ALLOW_MAIN_PUSH=1 git push
```
