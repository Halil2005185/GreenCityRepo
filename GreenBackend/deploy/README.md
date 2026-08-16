# نشر الباك‌اند على الـVPS

هذا المجلد يحمل كل ما يلزم لتشغيل `gc-service.evavolunteer.com`: صورة Docker، ملف Compose، إعداد Nginx، وسكربتَي النشر والنسخ الاحتياطي.

| الملف | الدور |
|---|---|
| `compose.prod.yml` | PostgreSQL، الترحيل، الـAPI، عامل البريد |
| `.env.vps.example` | نموذج متغيرات الإنتاج — يُنسخ إلى `.env` على الخادم |
| `nginx/gc-service.bootstrap.conf` | إعداد مؤقت لاستصدار أول شهادة |
| `nginx/gc-service.conf` | الإعداد النهائي: HTTPS ووكالة إلى `127.0.0.1:4000` |
| `deploy.sh` | جلب، بناء، ترحيل، تشغيل، فحص جاهزية |
| `backup.sh` | `pg_dump` يومي مع مدة احتفاظ |

## خريطة النطاقات

| النطاق | الخدمة | ضمن هذا الملف؟ |
|---|---|---|
| `gc-service.evavolunteer.com` | الـAPI | نعم |
| `gc-admin.evavolunteer.com` | لوحة الفريق وبوابة الشركاء | لا |
| `greencities.evavolunteer.com` | الموقع العام | لا |

### قبل نشر اللوحة: أصل واحد شرط لا خيار

الـAPI على نطاق واللوحة على نطاق آخر. هذا سليم بشرط واحد: **متصفح المستخدم لا ينادي `gc-service` مباشرة.** اللوحة تمرّر `/api` من خادم Next إلى الـAPI داخليًا — الآلية موجودة أصلًا في `GreenAdminDash/next.config.ts`، ويكفي ضبط `API_ORIGIN` عند نشرها على العنوان الداخلي للـAPI.

سبب الشرط أن كوكي تلميح الجلسة يقرأه خادم Next في `proxy.ts` ليقرر إلى أين يوجّه الزائر. لو ضبطه الـAPI من `gc-service` لما أرسله المتصفح إلى `gc-admin` أصلًا، فلا يراه `proxy.ts`، فيعيد كل زائر إلى صفحة الدخول بعد دخوله مباشرة — حلقة لا تنكسر.

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

المنفذ `4000` غير مفتوح عمدًا: Compose ينشره على `127.0.0.1` فقط، وPostgreSQL لا ينشر منفذًا إطلاقًا.

### 3. DNS

سجل `A` باسم `gc-service` على نطاق `evavolunteer.com` يشير إلى IP الخادم. تحقق قبل المتابعة:

```bash
dig +short gc-service.evavolunteer.com
```

### 4. Nginx والشهادة

```bash
sudo apt install -y nginx certbot
sudo mkdir -p /var/www/certbot
sudo cp ~/GreenCitys/GreenBackend/deploy/nginx/gc-service.bootstrap.conf /etc/nginx/sites-available/gc-service
sudo ln -sf /etc/nginx/sites-available/gc-service /etc/nginx/sites-enabled/gc-service
sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d gc-service.evavolunteer.com --agree-tos -m البريد@evavolunteer.com --no-eff-email
```

ثم استبدل الإعداد المؤقت بالنهائي:

```bash
sudo cp ~/GreenCitys/GreenBackend/deploy/nginx/gc-service.conf /etc/nginx/sites-available/gc-service
sudo nginx -t && sudo systemctl reload nginx
```

التجديد التلقائي يأتي مع حزمة certbot عبر مؤقّت systemd. تحقق منه ومن أن Nginx يلتقط الشهادة الجديدة:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run --deploy-hook "systemctl reload nginx"
```

### 5. المستودع والمتغيرات

المستودع خاص، فالخادم يحتاج مفتاح نشر مقروءًا فقط (Deploy Key في إعدادات المستودع على GitHub):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

بعد إضافته على GitHub:

```bash
git clone git@github.com:<المنظمة>/GreenCitys.git ~/GreenCitys
cd ~/GreenCitys/GreenBackend/deploy
cp .env.vps.example .env && chmod 600 .env
```

حرّر `.env` وغيّر ما لا يصح تركه:

```bash
openssl rand -base64 32   # JWT_ACCESS_SECRET
openssl rand -base64 24   # POSTGRES_PASSWORD
```

`POSTGRES_PASSWORD` يجب أن تطابق كلمة المرور داخل `DATABASE_URL`. اقرأ تعليقات الملف قبل تغيير `AUTH_COOKIE_DOMAIN` أو `TRUST_PROXY`.

## النشر

```bash
~/GreenCitys/GreenBackend/deploy/deploy.sh
```

السكربت يجلب `main`، يبني الصور، يشغّل الترحيل، يرفع الخدمات، ثم يفحص `/api/health/ready` حتى ثوانٍ معدودة. الـAPI لا يبدأ قبل نجاح الترحيل — الشرط في `compose.prod.yml` لا في السكربت — فلا يخدم إصدار جديد قاعدةً بمخطط قديم.

أول تشغيل بعده يحتاج بذر الأدوار والمكاتب وحساب المدير:

```bash
cd ~/GreenCitys/GreenBackend/deploy
docker compose -f compose.prod.yml run --rm -e SEED_ADMIN_EMAIL=... -e SEED_ADMIN_PASSWORD=... migrate npm run db:seed
```

`~/GreenCitys` نسخة نشر لا نسخة عمل: السكربت يرفض العمل إن وجد تعديلات غير مُودعة، ويعيد الشجرة إلى `origin/main` بالضبط.

### الأتمتة من GitHub

[`.github/workflows/deploy-backend.yml`](../../.github/workflows/deploy-backend.yml) يبني ويفحص الأنواع على GitHub، وعند النجاح يشغّل `deploy.sh` عبر SSH. يعمل عند كل دفع إلى `main` يمس `GreenBackend/`، أو يدويًا من تبويب Actions.

يحتاج أسرارًا في إعدادات المستودع:

| السر | القيمة |
|---|---|
| `VPS_HOST` | IP الخادم أو اسمه |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | مفتاح خاص جديد يُخصص لهذا الغرض، وعامّه في `~deploy/.ssh/authorized_keys` |
| `VPS_KNOWN_HOSTS` | مخرجات `ssh-keyscan <IP>` — تُؤخذ مرة واحدة من مصدر موثوق |

ومتغير اختياري `VPS_APP_DIR` إن لم يكن المستودع في `~/GreenCitys`.

لا تعيد استعمال مفتاحك الشخصي. المفتاح المخصص يُلغى وحده إن تسرّب.

## النسخ الاحتياطي

```bash
sudo crontab -e
```

```cron
0 3 * * * /home/deploy/GreenCitys/GreenBackend/deploy/backup.sh >> /var/log/greencities-backup.log 2>&1
```

النسخة تبقى على القرص نفسه، وهذا لا يحمي من فقد الخادم. أضف نقلًا خارجيًا في نهاية `backup.sh`.

الاسترجاع:

```bash
docker compose -f compose.prod.yml stop api worker
docker compose -f compose.prod.yml exec -T postgres \
  pg_restore -U greencities_app -d greencities --clean --if-exists < نسخة.dump
docker compose -f compose.prod.yml start api worker
```

جرّب الاسترجاع مرة على قاعدة اختبارية قبل أن تحتاجه فعلًا. نسخة لم تُجرَّب ليست نسخة.

## التشخيص

```bash
cd ~/GreenCitys/GreenBackend/deploy

docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs -f api
docker compose -f compose.prod.yml logs --tail 100 migrate
curl -s http://127.0.0.1:4000/api/health/ready
```

| العَرَض | الأرجح |
|---|---|
| `migrate` يخرج بخطأ | `DATABASE_URL` لا يطابق `POSTGRES_*`، أو كلمة مرور غير مُرمَّزة URL |
| الـAPI يسقط عند البدء | فشل فحص Zod للمتغيرات — الرسالة تسمّي المتغير الناقص |
| `502` من Nginx | الحاوية لم تبدأ، أو `HOST` ليس `0.0.0.0` داخلها |
| دعوات لا تصل | `MAIL_ENABLED=false`، أو نطاق المرسل غير متحقَّق في Resend. الرسائل محفوظة في صندوق الصادر وتُرسل عند التفعيل |
| `403 مصدر الطلب غير مسموح` | أصل اللوحة غير مذكور في `CORS_ORIGINS` |

## ما ليس هنا

نشر اللوحة والموقع العام. وقبل نشر الموقع لاحقًا: مجلد `GreenWebsite/` غير مُودَع في Git بعد، وكذلك `GreenAdminDash/public/` — أي نشر يسحب من Git لن يجد شيئًا منهما.
