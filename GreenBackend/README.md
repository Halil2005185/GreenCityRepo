# Green Cities API

أساس الباك‌اند مبني على Node.js وExpress 5 وTypeScript وDrizzle ORM وPostgreSQL. الاتصال بقاعدة البيانات لا يعتمد على مزود محدد؛ تغيير `DATABASE_URL` يكفي للانتقال من الجهاز المحلي إلى قاعدة PostgreSQL على الـVPS.

إصدارات Drizzle ORM وDrizzle Kit موحّدة على سلسلة v1 RC الحالية ومثبتة في `package-lock.json`؛ لا تحدّث أحدهما منفردًا لأن تنسيق المخطط وأداة migrations يجب أن يبقيا متوافقين.

## الهيكل

```text
GreenBackend/
├─ drizzle/                 # ملفات SQL المولدة من Drizzle Kit
├─ deploy/                  # أمثلة متغيرات بيئة الـVPS
├─ src/
│  ├─ common/               # الأخطاء وmiddlewares المشتركة
│  ├─ config/               # فحص متغيرات البيئة بواسطة Zod
│  ├─ db/                   # اتصال PostgreSQL ومخططات Drizzle
│  ├─ modules/              # وحدات الميزات؛ كل وحدة routes/controller/service/schema
│  ├─ routes/               # تجميع مسارات الـAPI
│  ├─ types/                # توسعات TypeScript العامة
│  ├─ app.ts                # إعداد Express فقط، مناسب للاختبار
│  └─ server.ts             # التشغيل والإغلاق الآمن
├─ test/                    # اختبارات API
├─ compose.local.yml        # PostgreSQL اختياري عبر Docker
├─ drizzle.config.ts
└─ package.json
```

## التشغيل محليًا مع PostgreSQL المثبت

المتطلبات: Node.js 20 أو أحدث وPostgreSQL 15 أو أحدث.

1. افتح `psql` بحساب الإدارة وأنشئ مستخدمًا وقاعدة مستقلة للتطبيق:

```sql
CREATE ROLE greencities_app WITH LOGIN PASSWORD 'ضع-كلمة-مرور-قوية';
CREATE DATABASE greencities OWNER greencities_app ENCODING 'UTF8';
```

2. انسخ `.env.example` إلى `.env`، ثم حدّث كلمة المرور داخل `DATABASE_URL`. إذا احتوت كلمة المرور على رموز خاصة، حوّلها إلى URL encoding.
3. ثبّت الاعتماديات وشغّل migration ثم الخادم:

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
```

المسارات الأولية:

- `GET /api/health` — فحص أن عملية Node تعمل.
- `GET /api/health/ready` — فحص اتصال PostgreSQL فعليًا.

### PostgreSQL اختياري عبر Docker

الخدمة المحلية المثبتة تستخدم المنفذ `5432`. لذلك يستخدم ملف Compose المنفذ `5433` افتراضيًا لتجنب التعارض:

```powershell
docker compose -f compose.local.yml up -d
```

عندها اجعل منفذ `DATABASE_URL` هو `5433`.

## النشر على VPS

الإجراء كاملًا في [deploy/README.md](deploy/README.md): تجهيز الخادم، Nginx والشهادة على `gc-service.evavolunteer.com`، النشر عبر `deploy/deploy.sh`، والأتمتة من GitHub Actions.

باختصار: القاعدة على Neon، و`deploy/compose.prod.yml` يشغّل خدمة ترحيل تنتهي قبل بدء الـAPI وعامل البريد. التطبيق يستمع داخل حاويته على `0.0.0.0:4000`، وCompose ينشر المنفذ على `127.0.0.1` للمضيف وحده، وNginx هو ما يصله من الخارج — ومعه `TRUST_PROXY=1`.

الترحيل يستعمل `DIRECT_URL` لا النقطة المُجمَّعة: تنفيذ DDL عبر PgBouncer في وضع المعاملات غير مضمون.

## دورة تغييرات قاعدة البيانات

عدّل أو أضف ملفات داخل `src/db/schema/` ثم:

```powershell
npm.cmd run db:generate  # ينشئ SQL قابلًا للمراجعة داخل drizzle/
npm.cmd run db:migrate   # يطبق migrations غير المطبقة
npm.cmd run db:studio    # واجهة استعراض محلية اختيارية
```

استخدم `db:push` للتجارب المحلية السريعة فقط. في الـVPS استخدم ملفات migration المراجعة والمحفوظة في Git.

## تنظيف بيانات التطوير

```powershell
npm.cmd run db:reset
```

يمسح **كل** بيانات العمل ثم يعيد بذر المكاتب والأدوار وحساب المدير. لا رجعة فيه، ويرفض العمل إذا كان `NODE_ENV=production`.

قائمة الجداول تُقرأ من `information_schema` لا مكتوبة يدويًا، فجدول جديد يدخل التنظيف تلقائيًا. يُستثنى `__drizzle_migrations` و`app_metadata` وحدهما.

لتحديد حساب المدير بدل توليد كلمة مرور عشوائية:

```powershell
$env:SEED_ADMIN_EMAIL="you@example.com"; $env:SEED_ADMIN_PASSWORD="..."; npm.cmd run db:reset
```

## الاختبارات

```powershell
npm.cmd test
```

اختبارات التكامل تحتاج قاعدة مستقلة عبر `TEST_DATABASE_URL`، لأنها تُفرّغ الجداول بين الحالات. يرفض الحارس في `test/helpers/database.ts` التشغيل على أي قاعدة لا ينتهي اسمها بـ`_test`. بدون المتغير تُتخطّى اختبارات التكامل بتحذير ظاهر بدل أن تلمس بياناتك.
