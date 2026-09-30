/**
 * عامل خدمة التطبيق الميداني — نطاقه `/app/` وحده، فلا يمسّ صفحات الموقع.
 *
 * يُخدَم من `/app/sw.js` عبر معالج مسار يضع مكان الرموز أدناه رقم البناء
 * وقائمة الصفحات. تغيّر رقم البناء يغيّر بايتات هذا الملف، فيثبّت المتصفح
 * العامل الجديد من تلقائه ويحفظ صفحات البناء الجديد.
 *
 * مكتوب باليد لا مولَّدًا: صفحات التطبيق قشور ثابتة تقرأ بياناتها من الـAPI
 * في المتصفح، فلا قائمة أصول تُحقن من البناء. ما تحتاجه الصفحة من ملفات
 * يُقرأ من HTML الصفحة نفسها عند حفظها.
 *
 * وليس فيه مزامنة خلفية: واجهة Background Sync غير متاحة على iOS. الطابور
 * يفرّغه التطبيق وهو مفتوح.
 */

const VERSION = "__GC_FIELD_VERSION__";
const SHELLS = "__GC_FIELD_SHELLS__";
const OFFLINE_URL = "__GC_FIELD_OFFLINE__";
const SCOPE_PATH = "__GC_FIELD_SCOPE__";

const PAGES = `gc-field-pages-${VERSION}`;
const DATA = `gc-field-rsc-${VERSION}`;

/**
 * ملفات البناء يحمل اسمها بصمة محتواها، فلا تتغيّر تحت اسمها أبدًا. مخزنها
 * يعبر النسخ: ما بقي من بناء سابق لا يُنزَّل مرة ثانية.
 */
const STATIC = "gc-field-static";

/**
 * خرائط المواقع الثابتة في بطاقة المتطوع. عنوان الصورة يحمل إحداثياتها، فلا
 * تتغيّر تحته، ومخزنها يعبر النسخ كملفات البناء. عددها قليل — موقع أو اثنان
 * للمتطوع — والسقف يمنع تراكمها عند من تنقّل بين الحملات.
 */
const MAPS = "gc-field-maps";
const MAP_HOST = "api.mapbox.com";
const MAP_LIMIT = 12;

/** شبكة الميدان بطيئة لا معدومة؛ بعدها يُعرض المحفوظ ويُكمَل الجلب خلفه. */
const NAVIGATION_TIMEOUT_MS = 4000;

const STATIC_PREFIX = "/_next/static/";

/**
 * ملفات من `public/` ترسمها القشرة ولا يحمل اسمها بصمة: رمز الهوية قناعًا
 * في رأس التطبيق. تُحفظ مع كل نسخة جديدة من مصدرها، فتغيّرها يصل مع النشر.
 */
const SHELL_FILES = ["/brand/logomark.png"];
const IN_HTML = /\/_next\/static\/[^"'\\\s)<>]+/g;
const IN_CSS = /url\(\s*["']?([^"')]+)["']?\s*\)/g;

/** ما تذكره الصفحة من ملفات البناء: سكربتاتها وأنماطها وخطوطها المحمَّلة سلفًا. */
function assetsOfPage(html) {
  return [...new Set(html.match(IN_HTML) ?? [])];
}

/** ما يذكره ملف الأنماط: الخطوط خصوصًا، وهي لا تظهر كلها في HTML. */
function assetsOfStylesheet(css, stylesheetUrl) {
  const found = new Set();

  for (const [, reference] of css.matchAll(IN_CSS)) {
    if (reference.startsWith("data:")) continue;

    const url = new URL(reference, new URL(stylesheetUrl, self.location.origin));

    if (url.origin === self.location.origin && url.pathname.startsWith(STATIC_PREFIX)) {
      found.add(url.pathname);
    }
  }

  return [...found];
}

async function putIfOk(cacheName, key, response) {
  if (!response.ok || response.type === "opaque") return;

  await (await caches.open(cacheName)).put(key, response);
}

async function precacheAsset(cache, path) {
  let response = await cache.match(path);

  if (!response) {
    response = await fetch(path, { credentials: "omit" });

    if (!response.ok) throw new Error(`precache ${path}: ${response.status}`);

    await cache.put(path, response.clone());
  }

  if (!path.endsWith(".css")) return;

  const nested = assetsOfStylesheet(await response.text(), path);

  await Promise.all(nested.map((asset) => precacheAsset(cache, asset)));
}

/**
 * الصفحة وملفاتها معًا، أو لا شيء: صفحة محفوظة بلا سكربتاتها تُفتح بلا
 * شبكة شاشةً لا تستجيب. فشل أي ملف يُفشل التثبيت، فيبقى العامل السابق
 * بصفحاته إلى محاولة تالية.
 */
async function precacheShell(url) {
  const response = await fetch(url, { credentials: "omit", cache: "no-cache" });

  if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);

  const assets = await caches.open(STATIC);
  const html = await response.clone().text();

  await Promise.all(
    assetsOfPage(html).map((asset) => precacheAsset(assets, asset)),
  );

  await (await caches.open(PAGES)).put(url, response);
}

/**
 * يُبقي من ملفات البناء ما تذكره صفحات هذه النسخة وأنماطها، ويمسح ما عداه.
 * بلا هذا يكبر المخزن مع كل نشر بحجم سكربتات لن يطلبها أحد.
 */
async function pruneStatic() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(STATIC);
  const referenced = new Set();

  for (const request of await pages.keys()) {
    const page = await pages.match(request);

    for (const asset of assetsOfPage(await page.text())) referenced.add(asset);
  }

  for (const path of [...referenced]) {
    if (!path.endsWith(".css")) continue;

    const stylesheet = await assets.match(path);

    if (!stylesheet) continue;

    for (const asset of assetsOfStylesheet(await stylesheet.text(), path)) {
      referenced.add(asset);
    }
  }

  // المقارنة بالمسار وحده: بعض المنصات تُلحق بالعنوان رقم النشر استعلامًا.
  const paths = new Set(
    [...referenced].map((asset) => new URL(asset, self.location.origin).pathname),
  );

  for (const request of await assets.keys()) {
    if (!paths.has(new URL(request.url).pathname)) await assets.delete(request);
  }
}

async function precacheShellFiles() {
  const pages = await caches.open(PAGES);

  await Promise.all(
    SHELL_FILES.map(async (path) => {
      const response = await fetch(path, {
        credentials: "omit",
        cache: "no-cache",
      });

      // غياب زينةٍ لا يُفشل التثبيت: القشرة تعمل بلا رمزها.
      if (response.ok) await pages.put(path, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([...SHELLS.map(precacheShell), precacheShellFiles()]).then(
      () => self.skipWaiting(),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, DATA, STATIC, MAPS]);

      for (const name of await caches.keys()) {
        if (name.startsWith("gc-field-") && !keep.has(name)) {
          await caches.delete(name);
        }
      }

      await pruneStatic();
      await self.clients.claim();
    })(),
  );
});

/** الاستعلام لا يميّز الصفحة: `/app/home?source=pwa` هي `/app/home` نفسها. */
function shellKey(url) {
  return url.origin + url.pathname;
}

/**
 * تحويلٌ إلى صفحة «بلا اتصال» لا محتواها تحت العنوان المطلوب: الصفحة تُرسم
 * لعنوانها، وعرضها تحت عنوان آخر يجعل React يجد عند الترطيب نصًّا غير الذي
 * يتوقعه لذلك العنوان.
 */
async function offlineFallback(pages, requested) {
  const saved = await pages.match(OFFLINE_URL);

  if (saved && requested.pathname !== OFFLINE_URL) {
    return Response.redirect(OFFLINE_URL, 302);
  }

  return (
    saved ??
    new Response("لا اتصال بالشبكة.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  );
}

/**
 * الشبكة أولًا، والمحفوظ إن تأخرت أو انقطعت، ثم صفحة «بلا اتصال».
 *
 * الشبكة أولًا لأن الصفحة قشرة تتغيّر مع كل نشر. والمهلة لأن اتصالًا يتعثّر
 * دقيقةً أسوأ من انقطاع: بعدها يُعرض المحفوظ ويُكمَل الجلب خلفه ليحدّثه. وما
 * لا محفوظ له ينتظر الشبكة ما انتظرت — لا بديل يُعرض مكانه.
 */
async function navigate(event) {
  const requested = new URL(event.request.url);
  const key = shellKey(requested);
  const pages = await caches.open(PAGES);

  const network = fetch(event.request).then((response) => {
    if (response.ok) event.waitUntil(putIfOk(PAGES, key, response.clone()));

    return response;
  });

  // يُستهلك الرفض هنا كي لا يبقى بلا معالج حين يسبقه المحفوظ.
  const settled = network.catch(() => null);

  const timeout = new Promise((resolve) =>
    setTimeout(resolve, NAVIGATION_TIMEOUT_MS, "timeout"),
  );

  const first = await Promise.race([settled, timeout]);

  if (first instanceof Response) return first;

  const cached = await pages.match(key);

  if (cached) {
    event.waitUntil(settled);

    return cached;
  }

  return (await settled) ?? offlineFallback(pages, requested);
}

/** ملف من القشرة بلا بصمة: المحفوظ مع هذه النسخة، وإلا الشبكة. */
async function shellFile(event, url) {
  const cached = await (await caches.open(PAGES)).match(url.pathname);

  return cached ?? fetch(event.request);
}

/** ملف يحمل بصمته في اسمه: المحفوظ هو الصحيح دائمًا. */
async function staticAsset(event) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(event.request.url);

  if (cached) return cached;

  const response = await fetch(event.request);

  event.waitUntil(putIfOk(STATIC, event.request.url, response.clone()));

  return response;
}

/**
 * حمولة التنقل داخل التطبيق (RSC). عنوانها يحمل `_rsc`، وهو بصمة لترويسات
 * الطلب، فالعنوان كاملًا مفتاح صحيح: الانتقال نفسه يعطي العنوان نفسه.
 * بلا محفوظ يفشل الطلب، فيعود Next إلى تحميل الصفحة كاملة — ولها محفوظها.
 */
async function routeData(event) {
  try {
    const response = await fetch(event.request);

    event.waitUntil(putIfOk(DATA, event.request.url, response.clone()));

    return response;
  } catch (error) {
    const cached = await (await caches.open(DATA)).match(event.request.url);

    if (cached) return cached;

    throw error;
  }
}

/**
 * خريطة الموقع: المحفوظ أولًا. المتطوع يفتح بطاقته مساء اليوم السابق على
 * شبكة بيته، ويحتاج الخريطة صباحًا في طريقه حيث لا شبكة.
 *
 * الصورة تُطلب بـCORS (`crossorigin` على العنصر)، فجوابها يُقرأ ويُحفظ
 * بحجمه. جواب معتم كان سيُحسب على الحصة بميغابايتات لكل صورة.
 */
async function mapImage(event) {
  const cache = await caches.open(MAPS);
  const cached = await cache.match(event.request.url);

  if (cached) return cached;

  const response = await fetch(event.request);

  if (response.ok && response.type !== "opaque") {
    // النسخة تؤخذ قبل أن يُسلَّم الجواب: جسمه يُقرأ مرة واحدة.
    const copy = response.clone();

    event.waitUntil(
      (async () => {
        await cache.put(event.request.url, copy);

        const keys = await cache.keys();

        for (const stale of keys.slice(0, Math.max(0, keys.length - MAP_LIMIT))) {
          await cache.delete(stale);
        }
      })(),
    );
  }

  return response;
}

/**
 * إشعار من المنسّق. الحمولة يكتبها الخادم: العنوان والنص وأين يُفتح.
 *
 * كل حدث يُظهر إشعارًا مهما كانت حمولته: الاشتراك `userVisibleOnly`، ومتصفح
 * يستقبل حدثًا بلا إشعار يعرض بدله «حُدّث هذا الموقع في الخلفية» ثم يسحب
 * الإذن إن تكرر.
 */
function readPush(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return {};
  }
}

/** الإشعار يفتح صفحة من التطبيق وحده، أيًّا كان ما في الحمولة. */
function targetOf(path) {
  const home = `${SCOPE_PATH}home`;

  try {
    const url = new URL(typeof path === "string" ? path : home, self.location.origin);
    const inside =
      url.origin === self.location.origin && url.pathname.startsWith(SCOPE_PATH);

    return inside ? url.href : new URL(home, self.location.origin).href;
  } catch {
    return new URL(home, self.location.origin).href;
  }
}

/** نوافذ التطبيق المفتوحة الآن، في أي تبويب كانت. */
async function openApps() {
  const open = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  return open.filter((client) =>
    new URL(client.url).pathname.startsWith(SCOPE_PATH),
  );
}

/**
 * التطبيق المفتوح يقرأ الإعلانات من جديد: ما جاء به الإشعار يظهر في صفحته
 * لحظة وصوله، لا حين يُنقر ولا عند الفتح التالي.
 */
async function refreshOpenApps() {
  for (const client of await openApps()) {
    client.postMessage({ type: "gc-field-announcement" });
  }
}

self.addEventListener("push", (event) => {
  const data = readPush(event);

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(
        typeof data.title === "string" && data.title
          ? data.title
          : "المدن الخضراء",
        {
          body: typeof data.body === "string" ? data.body : "",
          icon: "/app-icons/icon-192.png",
          badge: "/app-icons/badge-96.png",
          dir: "rtl",
          lang: "ar",
          // الوسم معرّف الإعلان: إعادة إرساله تحلّ محلّه ولا تكرّره.
          ...(typeof data.tag === "string" ? { tag: data.tag } : {}),
          data: { url: targetOf(data.url) },
        },
      ),
      // تحديث الصفحة زينة فوق الإشعار: فشله لا يُسقط الإشعار نفسه.
      refreshOpenApps().catch(() => undefined),
    ]),
  );
});

/**
 * النقر يعيد إلى التطبيق المفتوح إن وُجد، وإلا يفتحه. نافذة ثانية للتطبيق
 * نفسه تعني طابورين يفرّغان معًا.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = targetOf(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const [ours] = await openApps();

      if (ours) {
        ours.postMessage({ type: "gc-field-announcement" });

        try {
          await ours.focus();

          return;
        } catch {
          // نافذة لا يُسمح بإبرازها: تُفتح أخرى بدل أن يضيع النقر.
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.hostname === MAP_HOST && url.pathname.includes("/static/")) {
    event.respondWith(mapImage(event));

    return;
  }

  // الـAPI والتخزين وكل ما ليس من أصل الموقع يمرّ كما هو: التطبيق يحفظ
  // بياناته بنفسه، وعامل الخدمة لا يعرف أيها يخص من.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(STATIC_PREFIX)) {
    event.respondWith(staticAsset(event));

    return;
  }

  if (SHELL_FILES.includes(url.pathname)) {
    event.respondWith(shellFile(event, url));

    return;
  }

  if (!url.pathname.startsWith(SCOPE_PATH)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(event));

    return;
  }

  if (request.headers.get("rsc") === "1") {
    event.respondWith(routeData(event));
  }
});
