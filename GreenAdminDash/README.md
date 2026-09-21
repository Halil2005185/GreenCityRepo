# لوحة التحكم — المدن الخضراء

لوحة فريق إيفا وبوابة الشركاء على Next.js 16. التشغيل المحلي والمبدأ الحاكم في
[README الجذر](../README.md)؛ باختصار:

```bash
npm install
npm run dev   # http://localhost:3000 — يمرّر /api إلى الـAPI على المنفذ 4000
```

## النشر على Cloudflare Workers

تُنشر اللوحة Workerًا اسمه `greencities` عبر محوّل
[OpenNext](https://opennext.js.org/cloudflare). كل ما يلزم داخل المستودع، فلا
يعتمد النشر على الإعداد التلقائي الذي يجريه `wrangler` عند غياب الملفات:

| الملف | الدور |
|---|---|
| `wrangler.jsonc` | اسم الـWorker وأعلام التوافق، و`build.command` الذي يبني التطبيق قبل الرفع |
| `open-next.config.ts` | إعداد المحوّل — بلا cache لأن لا ISR في اللوحة |
| `.env.production` | `API_ORIGIN` العلني الذي يُبنى عليه تمرير `/api` — قيم علنية فقط، مُودَع عمدًا |
| `.env.production` | `NEXT_PUBLIC_SITE_URL` — عنوان الموقع العام، منه يُبنى رابط التسجيل الذي تنسخه صفحة الاستمارات. معطّل حتى يُنشر الموقع |
| `.env.production` | `NEXT_PUBLIC_MAPBOX_TOKEN` — رمز Mapbox العام (`pk.`) مقيّدًا بعناوين اللوحة. يُضمَّن في الحزمة وقت البناء، فهذه النسخة هي التي تعمل بها الخريطة؛ بدونها تظهر مكانها رسالة تشرح السبب |
| `wrangler.jsonc` | `vars.NEXT_PUBLIC_MAPBOX_TOKEN` — نسخة وقت التشغيل مطابقة للوحة Cloudflare كي لا يمحوها النشر. لا تصل المتصفح وحدها، فيتغيّر الرمز في الموضعين معًا |
| `public/_headers` | تخزين `/_next/static` سنة كاملة على حافة Cloudflare |
| `middleware.ts` | الحارس — على الـedge لا على Node.js (انظر أدناه) |

إعداد مشروع Workers Builds على Cloudflare: جذر المشروع `GreenAdminDash`، أمر
النشر `npx wrangler deploy`، **وبلا أمر بناء** — `build.command` في
`wrangler.jsonc` يتكفّل به، وتكراره هناك يبني التطبيق مرتين.

محليًا بعد `npx wrangler login`:

```bash
npm run cf:preview   # يبني ثم يشغّل الـWorker في workerd على localhost:8787
npm run cf:deploy    # يبني ثم ينشر
```

### لماذا `middleware.ts` لا `proxy.ts`

Next.js 16 أهمل اسم `middleware` لصالح `proxy`، لكن `proxy` يعمل على Node.js
حصرًا ولا يقبل ضبط `runtime`، ومحوّل OpenNext لـCloudflare لا يقبل إلا
middleware الـedge ويُسقط البناء عند غيره:
`Node.js middleware is not currently supported`. الحارس هنا Web APIs فقط فلا
يخسر شيئًا على الـedge. لا تُعِد التسمية قبل أن يدعم OpenNext ذلك.

### ما يجب أن يطابقه الباك‌اند

المتصفح لا ينادي `gc-service` مباشرة: الـWorker يمرّر `/api` إليه، فتبقى الكوكي
على أصل اللوحة — شرط `SameSite=Strict`. وعليه في `.env` على الخادم:

- `CORS_ORIGINS` يحوي أصل اللوحة، وإلا رُفض كل طلب مغيّر بـ`403`. النموذج يذكر
  `https://gc-admin.evavolunteer.com`؛ اربط الـWorker بهذا النطاق (Custom
  Domain)، أو أضف عنوان `workers.dev` مؤقتًا أثناء التجربة.
- `ADMIN_APP_URL` = عنوان اللوحة، فروابط الدعوات وإعادة التعيين تُبنى منه.
- `AUTH_COOKIE_DOMAIN` يبقى فارغًا.

تنبيه: الطلبات تصل الخادم من عناوين Cloudflare لا من المستخدم، فحدود المعدل
وسجل التدقيق ترى تلك العناوين حتى يُضبط Nginx ليثق بنطاقات Cloudflare (انظر
التعليق آخر `GreenBackend/deploy/nginx/gc-service.conf`).
