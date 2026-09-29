# نشر الباك‌اند على الـVPS

هذا المجلد يحمل كل ما يلزم لتشغيل `gc-service.evavolunteer.com`: صورة Docker، ملف Compose، إعداد Nginx، والقاعدة ونسخها.

| الملف | الدور |
|---|---|
| `compose.prod.yml` | الترحيل، الـAPI، عامل البريد |
| `.env.vps.example` | نموذج متغيرات الإنتاج — يُنسخ إلى `.env` على الخادم |
| `nginx/gc-service.bootstrap.conf` | إعداد مؤقت لاستصدار أول شهادة |
| `nginx/gc-service.conf` | الإعداد النهائي: HTTPS ووكالة إلى `127.0.0.1:4100` |
| `deploy.sh` | بناء، ترحيل، تشغيل، فحص جاهزية |
| `database/` | تجهيز PostgreSQL على الخادم، النقل من Neon، النسخ والاستعادة — يدوية كلها |
| `backup.sh` | المسار السابق لمهمة cron، يحوّل إلى `database/backup.sh` |

القاعدة **على الخادم نفسه**: عنقود PostgreSQL 18 أصلي تحت systemd باسم `18/greencities`، لا حاوية. الـAPI يصله عبر مقبس Unix مركَّب في الحاوية، فلا تستمع القاعدة على أي واجهة شبكة.

كانت على Neon حتى سقط الإنتاج كله حين نفدت حصة الخطة المجانية. حوسبته لا تنام أصلًا — العامل يسأل صندوق البريد كل خمس ثوانٍ — فالخطة المجانية ستنفد كل شهر، والتجاوز يوقف كل شيء دون إنذار. هنا لا حصة، ولا استيقاظ بارد، والاتصال مقبس لا شبكة. الثمن أن النسخ الاحتياطي مسؤوليتنا — [القسم أدناه](#النسخ-الاحتياطي) ليس اختياريًا.

العنقود مخصص لا الافتراضي `main` لأن الخادم يحمل مشاريع أخرى: يُضبط ويُعاد تشغيله دون أن يمس غيره.

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
| `DATABASE_URL` | رابط المقبس المحلي — يطبعه `migrate-from-neon.sh` بعد النقل. الخطوة 7 |
| `API_PORT` | منفذ حرّ على المضيف؛ غيّره إن كان `4000` مشغولًا |
| `PUBLIC_SITE_URL` | عنوان الموقع العام، `https://greencities.evavolunteer.com`. عليه تُبنى روابط المتطوعين الشخصية في التطبيق الميداني |

**خادم قائم قبل التطبيق الميداني** لا يحمل ملفه `PUBLIC_SITE_URL`: الملف
`deploy/.env` يبقى بين النشرات ولا يُستبدل بالنموذج. أضف السطر إليه يدويًا
وأعد تشغيل الحاوية. وحتى يُضاف، يرفض الخادم توليد الروابط من اللوحة برسالة
تسمّي المتغيّر، وبقية النظام تعمل.

لا `DIRECT_URL`: كان للنقطة المباشرة في Neon. واقرأ تعليقات الملف قبل تغيير `AUTH_COOKIE_DOMAIN` أو `TRUST_PROXY`.

### 6. تخزين الملفات — Cloudflare R2

الرفع يذهب من متصفح الموظف — ومن هاتف قائد المجموعة في التطبيق الميداني — إلى
R2 مباشرة، والخادم يوقّعه فقط: الملف لا يمرّ بالـVPS، فلا يستهلك ذاكرته ولا
نطاقه. أربع خطوات في لوحة Cloudflare:

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

**٤. اسمح للوحة وللتطبيق الميداني بالرفع (CORS)**: السطل → Settings → CORS
Policy:

```json
[
  {
    "AllowedOrigins": [
      "https://gc-admin.evavolunteer.com",
      "https://greencities.evavolunteer.com",
      "http://localhost:3000",
      "http://localhost:3001"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

بدونها يرفض المتصفح الرفع قبل أن يبدأ. و`PUT` وحدها تكفي: القراءة تمرّ
بالنطاق المربوط لا بنقطة S3.

أصل الموقع (`greencities.evavolunteer.com`) هنا للتطبيق الميداني على `/app`:
قائد المجموعة يرفع صور موقعه من هاتفه. **بدونه تبقى كل صورة في التطبيق «لم
تُرفع بعد»**: الخادم يوقّع الرابط بنجاح، ثم يرفض المتصفح `PUT`، فيعيد التطبيق
المحاولة ستّ مرات ثم يعرض الصورة على صاحبها بأنها تعذّر رفعها. والحضور
والأعداد لا يتأثران — هما لا يمرّان بالسطل. زوّار الموقع لا يرفعون شيئًا:
التوقيع يلزمه جلسة قائد ومجموعة يقودها.

ثم املأ في `.env`: `R2_ACCOUNT_ID` و`R2_BUCKET` و`R2_ACCESS_KEY_ID`
و`R2_SECRET_ACCESS_KEY` و`R2_PUBLIC_BASE_URL`، وأعد تشغيل الحاوية. وقبل ذلك
يعمل النظام كاملًا، ويردّ مسار الرفع وحده بأن التخزين غير مهيّأ.

### 7. قاعدة البيانات — PostgreSQL على الخادم ونقل بيانات Neon

سكربتات `database/` تُشغَّل يدويًا بـ`sudo`، ولا يشغّل النشر منها شيئًا. إعداداتها في `database/.env` منفصلًا عن `deploy/.env`: ذاك يُحمَّل في حاويات التطبيق، ومفاتيح سطل النسخ ورابط Neon لا مكان لهما هناك.

```bash
cd /opt/greencities/GreenBackend/deploy/database
cp .env.example .env && chmod 600 .env
nano .env                  # NEON_DATABASE_URL يكفي الآن — النقطة المباشرة بلا -pooler
sudo ./setup-native.sh
```

`setup-native.sh` متكرر بلا ضرر، ويفعل:

- يثبّت PostgreSQL 18 من `apt.postgresql.org` إن لم يوجد — توزيعة Ubuntu تحمل 16، وNeon على 18، و`pg_dump` أقدم من الخادم يرفض القراءة منه.
- ينشئ العنقود `18/greencities` بإعدادات لغة Neon نفسها (مزوّد `builtin` و`C.UTF-8`)، فيبقى ترتيب الأسماء العربية كما كان.
- مجلد مقبس دائم في `/var/lib/greencities-pgsocket` تركّبه الحاويات، لأن `/var/run/postgresql` يُمحى عند كل إقلاع.
- `conf.d/greencities.conf` بإعدادات لخادم صغير، وقاعدة `pg_hba` تسمح لدور التطبيق بكلمة مرور عبر المقبس.
- الدور والقاعدة وملكيتهما. كلمة المرور يولّدها ويكتبها في `database/.env` إن تركتها فارغة.
- ويثبت في آخره أن الدور يتصل فعلًا بالطريق الذي سيسلكه الـAPI.

ثم البيانات:

```bash
sudo ./migrate-from-neon.sh
```

يقرأ من Neon ولا يكتب فيه، ويوقف الـAPI والعامل طوال النقل كي تثبت الأرقام. يفرّغ، ثم يستعيد بصفة دور التطبيق **في معاملة واحدة** — الفشل لا يترك شيئًا نصف منقول — ثم يعدّ صفوف كل جدول على الجهتين، ولا يعلن النجاح إلا إن تطابقت كلها. جدول ترحيلات drizzle ينتقل مع البيانات، فيكمل النشر التالي من حيث توقف Neon.

**إن كان Neon يرفض الاتصال** (نفاد الحصة): إما ترقية خطته يومًا لإتمام النقل الحي، أو النقل من آخر نسخة أخذها `backup.sh` السابق:

```bash
ls -lh /var/backups/greencities/
sudo ./migrate-from-neon.sh --from-dump /var/backups/greencities/<أحدث ملف>.dump
```

ما كُتب في Neon بعد وقت النسخة لا يصل، والسكربت يطبع ذلك الوقت ويطلب التأكيد قبل أن يبدأ.

**النقل إلى القاعدة المحلية** — بعد أن يعلن السكربت التحقق، لا قبله. في `deploy/.env`:

```ini
DATABASE_URL=postgresql://greencities:<DB_PASSWORD>@localhost:5432/greencities?host=/var/run/postgresql&sslmode=disable
DATABASE_SSL=false
```

**واحذف سطر `DIRECT_URL` كله.** drizzle-kit يفضّله على `DATABASE_URL`، فبقاؤه على Neon يجعل الترحيل يجري هناك والتطبيق يقرأ من هنا. `deploy.sh` يرفض النشر في هذه الحالة، ويرفضه أيضًا إن لم يجد المقبس.

المنفذ والرابط كاملًا يطبعهما `migrate-from-neon.sh`. أما كلمة المرور فلا يطبعها — المخرجات تُنسخ إلى محادثات وتذاكر — وتقرأ من `database/.env`. و`localhost` في الرابط ليس اتصال شبكة: `host=` بعده يوجّه pg إلى المقبس، لكنه شرط لأن التحقق من المتغيرات يرفض رابطًا بمضيف فارغ.

```bash
/opt/greencities/GreenBackend/deploy/deploy.sh
```

**لا تحذف مشروع Neon الآن.** اتركه أيامًا احتياطًا حتى يثبت الموقع على البيانات المحلية، ثم امسح `NEON_DATABASE_URL` من `database/.env`.

## النشر

```bash
/opt/greencities/GreenBackend/deploy/deploy.sh
```

السكربت يبني الصور، يشغّل الترحيل والمزامنة خطوةً مستقلة (`docker compose run --rm migrate`)، ثم يرفع api وworker بـ`--no-deps`، ثم يفحص `/api/health/ready` حتى ثوانٍ معدودة.

الترتيب هو الضمانة لا `depends_on`. فشل الترحيل يوقف السكربت قبل لمس الخدمات، فيبقى الإصدار العامل يخدم، ويظهر سبب الفشل في سجل GitHub Actions. أما `docker compose up -d` وحده فيعيد إنشاء api — أي يزيل الإصدار العامل — قبل أن ينتظر نجاح الترحيل، فإن فشل بقي الخادم بلا API. هذا ما حدث في نشر #31، فلا تستعمله بديلًا عن السكربت.

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

Neon كان يحفظ نسخه بنفسه. لا شيء يفعل ذلك الآن، فهذا القسم ليس اختياريًا: حتى تعمل مهمة cron، النسخة الوحيدة من البيانات ملفات عنقود واحد على خادم واحد.

**نسخة خارج الخادم أولًا.** نسخة على قرص القاعدة نفسه لا تنجو من فقدان الخادم. أنشئ في R2 سطلًا **جديدًا خاصًا** بلا نطاق عام، لا سطل الملفات المرفوعة: ذاك يُخدَم للعموم، فنسخة تُكتب فيه تُنزَّل لمن يخمّن اسمها. ثم مفتاح API بصلاحية *Object Read & Write* على هذا السطل وحده، واملأ `BACKUP_R2_*` في `database/.env`.

جرّب قبل أن تثق:

```bash
cd /opt/greencities/GreenBackend/deploy/database
sudo ./backup.sh
```

ثم الجدولة:

```bash
sudo crontab -e
```

```cron
17 3 * * * /opt/greencities/GreenBackend/deploy/database/backup.sh >> /var/log/greencities-backup.log 2>&1
```

```bash
sudo install -m 644 logrotate-greencities-backup /etc/logrotate.d/greencities-backup
```

مهمة cron قديمة على `deploy/backup.sh` تبقى تعمل — الملف يحوّل إلى السكربت الجديد — لكن حدّثها إلى المسار أعلاه.

`backup.sh` يفرّغ بـ`pg_dump -Fc`، ثم **يقرأ الأرشيف من جديد** ليثبت أنه كامل: تفريغ انقطع يفشل الليلة لا بعد ثلاثة أشهر يوم الحاجة إليه. يحتفظ محليًا بأيام `BACKUP_KEEP_DAYS` ويرفع نسخة إلى R2 ويدوّرها هناك. ويرفض العمل تحت 10% مساحة حرة، لأن امتلاء القرص يوقف Postgres عن قبول الكتابة. آخر نجاح:

```bash
sudo cat /var/backups/greencities/.last-success
```

**جرّب الاستعادة مرة** بعد التجهيز. نسخة لم تُجرَّب تخمين:

```bash
sudo ./restore.sh                                   # يعرض النسخ
sudo ./restore.sh /var/backups/greencities/<ملف>.dump
```

يأخذ نسخة أمان من الحالة الحالية، ويوقف الـAPI والعامل، ويستعيد **في معاملة واحدة بصفة دور التطبيق** — الفشل يترك البيانات كما كانت، وما يُستعاد يملكه الدور الذي يستعمله الـAPI — ثم يعيد تشغيلهما.

ما يحمي منه هذا وما لا يحمي: نسخ ليلية منطقية تعني خسارة يوم كتابة على الأكثر. لا رجوع إلى دقيقة بعينها؛ إن احتيج إليه يومًا فالخطوة التالية أرشفة WAL لا cron أقصر.

## التشخيص

```bash
cd /opt/greencities/GreenBackend/deploy

docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs -f api
curl -s http://127.0.0.1:4100/api/health/ready

# القاعدة
systemctl status postgresql@18-greencities
journalctl -u postgresql@18-greencities -n 50
sudo -u postgres psql --cluster 18/greencities -d greencities
```

| العَرَض | الأرجح |
|---|---|
| النشر يتوقف عند «الترحيل والمزامنة» | المخرجات فوقه في سجل Actions. القاعدة متوقفة، أو `DATABASE_URL` خاطئ |
| `لا مقبس PostgreSQL في …` من `deploy.sh` | العنقود متوقف: `systemctl start postgresql@18-greencities` |
| `DIRECT_URL … يشير إلى قاعدة غير DATABASE_URL` | احذف سطر `DIRECT_URL` من `deploy/.env` |
| `Invalid environment variables … DATABASE_URL` | رابط بمضيف فارغ (`…@/greencities`). ضع `localhost` قبل المنفذ |
| `ENOENT … .s.PGSQL.5432` | المنفذ في الرابط غير منفذ العنقود (`pg_lsclusters`)، أو المقبس غير مركَّب في الحاوية |
| `no pg_hba.conf entry … no encryption` | `DATABASE_SSL=true` أو `sslmode=disable` ناقص: المقبس لا يحمل TLS |
| `password authentication failed` | كلمة المرور في الرابط غير التي في `database/.env` |
| `Peer authentication failed` | قاعدة الدور في `pg_hba.conf` بعد القاعدة العامة — أعد `setup-native.sh` |
| الـAPI يسقط عند البدء | فشل فحص Zod للمتغيرات — الرسالة تسمّي المتغير الناقص |
| `502` من Nginx | الحاوية لم تبدأ، أو `HOST` ليس `0.0.0.0` داخلها |
| دعوات لا تصل | `MAIL_ENABLED=false`، أو نطاق المرسل غير متحقَّق في Resend. الرسائل محفوظة في صندوق الصادر وتُرسل عند التفعيل |
| `403 مصدر الطلب غير مسموح` | أصل اللوحة أو الموقع غير مذكور في `CORS_ORIGINS` |
| صور التطبيق الميداني تبقى «لم تُرفع بعد» والحضور يصل | أصل الموقع غير مذكور في سياسة CORS على السطل (الخطوة ٤ من «تخزين الملفات») |

## ما ليس هنا

الموقع العام. أما اللوحة فتُنشر على Cloudflare Workers، والإجراء في [`GreenAdminDash/README.md`](../../GreenAdminDash/README.md). وقبل نشر الموقع لاحقًا: مجلد `GreenWebsite/` غير مُودَع في Git بعد — أي نشر يسحب من Git لن يجد شيئًا منه.
