# نشر الباك‌اند على الـVPS

هذا المجلد يحمل كل ما يلزم لتشغيل `gc-service.evavolunteer.com`: صورة Docker، ملف Compose، إعداد Nginx، وسكربتَي النشر والنسخ الاحتياطي.

| الملف | الدور |
|---|---|
| `compose.prod.yml` | الترحيل، الـAPI، عامل البريد |
| `.env.vps.example` | نموذج متغيرات الإنتاج — يُنسخ إلى `.env` على الخادم |
| `nginx/gc-service.bootstrap.conf` | إعداد مؤقت لاستصدار أول شهادة |
| `nginx/gc-service.conf` | الإعداد النهائي: HTTPS ووكالة إلى `127.0.0.1:4100` |
| `deploy.sh` | بناء، ترحيل، تشغيل، فحص جاهزية |
| `backup.sh` | `pg_dump` يومي من Neon مع مدة احتفاظ |

القاعدة على **Neon** لا على الخادم: النسخ والرجوع الزمني وترقيات الإصدار من عندهم، ولا تزاحم على موارد خادم يحمل مشاريع أخرى. الخادم في فرانكفورت والقاعدة في `eu-central-1`، فزمن الاتصال أرقام آحاد بالملّي ثانية.

## خريطة النطاقات

| النطاق | الخدمة | ضمن هذا الملف؟ |
|---|---|---|
| `gc-service.evavolunteer.com` | الـAPI | نعم |
| `gc-admin.evavolunteer.com` | لوحة الفريق وبوابة الشركاء | لا |
| `greencities.evavolunteer.com` | الموقع العام | لا |

### قبل نشر اللوحة: أصل واحد شرط لا خيار

الـAPI على نطاق واللوحة على نطاق آخر. هذا سليم بشرط واحد: **متصفح المستخدم لا ينادي `gc-service` مباشرة.** اللوحة تمرّر `/api` من خادم Next إلى الـAPI داخليًا — الآلية موجودة أصلًا في `GreenAdminDash/next.config.ts`، ويكفي ضبط `API_ORIGIN` عند نشرها على العنوان الداخلي للـAPI.

سبب الشرط أن كوكي تلميح الجلسة يقرأه خادم Next في `middleware.ts` ليقرر إلى أين يوجّه الزائر. لو ضبطه الـAPI من `gc-service` لما أرسله المتصفح إلى `gc-admin` أصلًا، فلا يراه `middleware.ts`، فيعيد كل زائر إلى صفحة الدخول بعد دخوله مباشرة — حلقة لا تنكسر.

العلاج بضبط `AUTH_COOKIE_DOMAIN=.evavolunteer.com` يعمل، لكنه يسلّم كوكي التحديث لكل نطاق فرعي على `evavolunteer.com` بما فيها ما لا علاقة له بالمشروع. لا تسلكه إلا بقرار واعٍ.

يبقى `gc-service` مدخلًا علنيًا صالحًا للموقع العام (يقرأ من الخادم لا من المتصفح) ولأي تكامل خارجي لاحق.

## تجهيز الخادم — مرة واحدة

المفترض Ubuntu 22.04 أو 24.04، ذاكرة 2GB فأكثر (بناء الصورة يحتاجها).

### 1. مستخدم النشر و Docker

```bash
sudo adduser --disabled-password --gecos "" deploy
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

عضوية مجموعة `docker` تعادل صلاحية الجذر عمليًا. أبقِ هذا المستخدم للنشر وحده.

### 2. الجدار الناري

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

منفذ الـAPI غير مفتوح عمدًا: Compose ينشره على `127.0.0.1` وحده، فلا يصله شيء إلا عبر Nginx.

### 3. DNS

سجل `A` باسم `gc-service` على نطاق `evavolunteer.com` يشير إلى IP الخادم. تحقق قبل المتابعة:

```bash
dig +short gc-service.evavolunteer.com
```

### 4. Nginx والشهادة

```bash
sudo apt install -y nginx certbot
sudo mkdir -p /var/www/certbot
sudo cp /opt/greencities/GreenBackend/deploy/nginx/gc-service.bootstrap.conf /etc/nginx/sites-available/gc-service
sudo ln -sf /etc/nginx/sites-available/gc-service /etc/nginx/sites-enabled/gc-service
sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d gc-service.evavolunteer.com --agree-tos -m البريد@evavolunteer.com --no-eff-email
```

ثم استبدل الإعداد المؤقت بالنهائي:

```bash
sudo cp /opt/greencities/GreenBackend/deploy/nginx/gc-service.conf /etc/nginx/sites-available/gc-service
sudo nginx -t && sudo systemctl reload nginx
```

التجديد التلقائي يأتي مع حزمة certbot عبر مؤقّت systemd، لكنه يكتب الشهادة على القرص ولا يخبر Nginx. بدون خطّاف يبقى Nginx على الشهادة المحمّلة في الذاكرة حتى تنتهي صلاحيتها والبديل جاهز بجانبها. الخطّاف عام على الخادم فيغطي كل الشهادات عليه:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null <<'HOOK'
#!/bin/sh
nginx -t && systemctl reload nginx
HOOK
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

ثم تحقق:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run --cert-name gc-service.evavolunteer.com
```

### 5. الكود والمتغيرات

الخادم لا يستنسخ المستودع ولا يحمل أي اعتماد لـGitHub: سياسة المنظمة تمنع deploy keys، والـworkflow يشحن الشجرة عبر SSH. للتجهيز الأول ادفعها من جهازك:

```bash
git archive HEAD GreenBackend | ssh <المستخدم>@<الخادم> "mkdir -p /opt/greencities && tar xf - -C /opt/greencities"
```

ثم على الخادم:

```bash
cd /opt/greencities/GreenBackend/deploy
cp .env.vps.example .env && chmod 600 .env
openssl rand -base64 32   # JWT_ACCESS_SECRET
```

وحرّر `.env`. ما لا يصح تركه على قيمته:

| المتغير | القيمة |
|---|---|
| `JWT_ACCESS_SECRET` | مخرجات `openssl` أعلاه |
| `DATABASE_URL` | رابط Neon المُجمَّع (`-pooler` في الاسم) لفرع **الإنتاج** |
| `DIRECT_URL` | رابط Neon المباشر للفرع نفسه — يستعمله الترحيل |
| `API_PORT` | منفذ حرّ على المضيف؛ غيّره إن كان `4000` مشغولًا |

استعمل فرع Neon مخصصًا للإنتاج لا الفرع الذي تطوّر عليه. واقرأ تعليقات الملف قبل تغيير `AUTH_COOKIE_DOMAIN` أو `TRUST_PROXY`.

### 6. تخزين الملفات — Cloudflare R2

الرفع يذهب من متصفح الموظف إلى R2 مباشرة، والخادم يوقّعه فقط: الملف لا يمرّ
بالـVPS، فلا يستهلك ذاكرته ولا نطاقه. أربع خطوات في لوحة Cloudflare:

**١. أنشئ السطل**: R2 → Create bucket. المستعمل اليوم `greencities-media`،
والموقع تلقائي. لا تجعله عامًا من هنا.

**٢. أنشئ مفتاح API**: R2 → Manage R2 API Tokens → Create API token، بصلاحية
**Object Read & Write** — لا Read only، فالرفع كتابة — ومقصورة على هذا السطل
وحده لا على كل سطول الحساب. تظهر لك قيمتان: `Access Key ID`
و`Secret Access Key` — **السرّ يظهر مرة واحدة**، انسخه فورًا إلى `.env` على
الخادم ولا تودعه في Git ولا ترسله في محادثة.

**٣. اربط نطاقًا للقراءة**: السطل → Settings → Public access → Connect Domain،
المستعمل اليوم `media.evavolunteer.com` (يجب أن يكون النطاق على الحساب نفسه).
هذا وحده ما يُقرأ منه علنًا، وقيمة `R2_PUBLIC_BASE_URL` هي
`https://media.evavolunteer.com`. القراءة تمرّ بشبكة Cloudflare
فتُخزَّن مؤقتًا، والمفاتيح تحمل معرّفًا عشوائيًا فلا يتغيّر محتواها أبدًا.

**٤. اسمح للوحة بالرفع (CORS)**: السطل → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": [
      "https://gc-admin.evavolunteer.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

بدونها يرفض المتصفح الرفع قبل أن يبدأ. و`PUT` وحدها تكفي: القراءة تمرّ
بالنطاق المربوط لا بنقطة S3. وأصل اللوحة وحده — الموقع العام لا يرفع شيئًا
اليوم، ويوم يرفع (سؤال يطلب ملفًا) يُضاف أصله هنا بحدوده الخاصة.

ثم املأ في `.env`: `R2_ACCOUNT_ID` و`R2_BUCKET` و`R2_ACCESS_KEY_ID`
و`R2_SECRET_ACCESS_KEY` و`R2_PUBLIC_BASE_URL`، وأعد تشغيل الحاوية. وقبل ذلك
يعمل النظام كاملًا، ويردّ مسار الرفع وحده بأن التخزين غير مهيّأ.

## النشر

```bash
/opt/greencities/GreenBackend/deploy/deploy.sh
```

السكربت يبني الصور، يشغّل الترحيل والمزامنة، يرفع الخدمات، ثم يفحص `/api/health/ready` حتى ثوانٍ معدودة. الـAPI لا يبدأ قبل نجاح الترحيل — الشرط في `compose.prod.yml` لا في السكربت — فلا يخدم إصدار جديد قاعدةً بمخطط قديم.

### المزامنة بعد الترحيل

خدمة `migrate` تشغّل `npm run db:deploy`: الترحيل، ثم `db:sync` الذي يطابق القاعدة بالكود. فقدرة جديدة تُضاف إلى الكتالوج وتُمنح لدور في `seed-data.ts` تصل إلى الإنتاج بالدمج وحده، دون دخول الخادم.

ما تفعله المزامنة بكل نوع يتبع من يملكه:

| البيانات | المالك | عند النشر |
|---|---|---|
| المكاتب، الأدوار وقدراتها، حدود المحافظات | الكود — لا تحرّرها اللوحة | تُكتب فوق ما في القاعدة |
| البرامج، المؤشرات، أشكال العمل الإعلامي، أنواع العلاقة | القاعدة بعد إنشائها — تحرّرها اللوحة | يُدرج الناقص، ولا يُمس الموجود |
| الحسابات | — | لا تُنشأ إطلاقًا |

كل تغيّر في قدرات دور قائم يُسجَّل في سجل التدقيق (`role.capabilities_synced`) بما أُضيف وما سُحب، لأنه يجري الآن بلا إنسان يشغّله.

يوم تُبنى شاشة لتحرير الأدوار أو المكاتب، ينتقل صفّها في الجدول من «الكود» إلى «القاعدة»، وإلا صار كل نشر يُرجع ما عدّله المدير.

### حساب المدير الأول

المزامنة لا تُنشئ حسابات: كلمة المرور المولَّدة تُطبع مرة واحدة، ومكانها طرفية من ينفّذ الأمر لا سجل حاوية. مرة واحدة بعد أول نشر:

```bash
cd /opt/greencities/GreenBackend/deploy
docker compose -f compose.prod.yml run --rm -e SEED_ADMIN_EMAIL=... -e SEED_ADMIN_PASSWORD=... migrate npm run db:seed
```

### الأتمتة من GitHub

[`.github/workflows/deploy-backend.yml`](../../.github/workflows/deploy-backend.yml) يبني ويفحص الأنواع على GitHub، ثم يشحن الشجرة إلى الخادم عبر SSH ويشغّل `deploy.sh`. يعمل عند كل دفع إلى `main` يمس `GreenBackend/`، أو يدويًا من تبويب Actions.

يحتاج أسرارًا في إعدادات المستودع:

| السر | القيمة |
|---|---|
| `VPS_HOST` | IP الخادم أو اسمه |
| `VPS_USER` | مستخدم النشر |
| `VPS_SSH_KEY` | مفتاح خاص **بلا عبارة مرور** يُخصص لهذا الغرض، وعامّه في `authorized_keys` على الخادم |
| `VPS_KNOWN_HOSTS` | سطور `known_hosts` للخادم — من اتصال تحققت من بصمته، لا من `ssh-keyscan` |

المجلد على الخادم `/opt/greencities` (متغير `APP_DIR` في الـworkflow).

لا تعيد استعمال مفتاحك الشخصي: المفتاح المخصص يُلغى وحده إن تسرّب، ولا يمكن لـActions أن يكتب عبارة مرور أصلًا.

`tar` لا يحذف ما ليس في الأرشيف، فملف `deploy/.env` على الخادم يبقى بين النشرات. وبالمقابل لا يُزال ملف حُذف من المستودع — نظّف يدويًا عند إعادة هيكلة كبيرة.

## النسخ الاحتياطي

Neon يوفّر رجوعًا زمنيًا، وهذا لا يغني عن نسخة تملكها أنت: الرجوع الزمني يحميك من خطأ في البيانات لا من فقدان الحساب.

```bash
sudo crontab -e
```

```cron
0 3 * * * /opt/greencities/GreenBackend/deploy/backup.sh >> /var/log/greencities-backup.log 2>&1
```

`backup.sh` يشغّل `pg_dump` في حاوية مؤقتة على النقطة المباشرة، فلا يحتاج المضيف عميل PostgreSQL. النسخة تبقى على قرص الخادم، وهذا لا يحمي من فقده — أضف نقلًا خارجيًا في نهاية السكربت.

الاسترجاع إلى فرع Neon جديد (لا فوق الإنتاج مباشرة):

```bash
docker run --rm -i -e PGURL='<رابط الفرع الجديد>' postgres:18-alpine \
  sh -c 'pg_restore -d "$PGURL" --clean --if-exists --no-owner' < نسخة.dump
```

جرّب الاسترجاع مرة قبل أن تحتاجه فعلًا. نسخة لم تُجرَّب ليست نسخة.

## التشخيص

```bash
cd /opt/greencities/GreenBackend/deploy

docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs -f api
docker compose -f compose.prod.yml logs --tail 100 migrate
curl -s http://127.0.0.1:4100/api/health/ready
```

| العَرَض | الأرجح |
|---|---|
| `migrate` يخرج بخطأ | `DIRECT_URL` خاطئ أو ناقص، أو فرع Neon موقوف |
| بطء أول طلب بعد سكون | Neon يوقف الحوسبة عند الخمول ويوقظها عند أول اتصال |
| الـAPI يسقط عند البدء | فشل فحص Zod للمتغيرات — الرسالة تسمّي المتغير الناقص |
| `502` من Nginx | الحاوية لم تبدأ، أو `HOST` ليس `0.0.0.0` داخلها |
| دعوات لا تصل | `MAIL_ENABLED=false`، أو نطاق المرسل غير متحقَّق في Resend. الرسائل محفوظة في صندوق الصادر وتُرسل عند التفعيل |
| `403 مصدر الطلب غير مسموح` | أصل اللوحة غير مذكور في `CORS_ORIGINS` |

## ما ليس هنا

الموقع العام. أما اللوحة فتُنشر على Cloudflare Workers، والإجراء في [`GreenAdminDash/README.md`](../../GreenAdminDash/README.md). وقبل نشر الموقع لاحقًا: مجلد `GreenWebsite/` غير مُودَع في Git بعد — أي نشر يسحب من Git لن يجد شيئًا منه.
