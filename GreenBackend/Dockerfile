# الاعتماديات الكاملة — مشتركة بين البناء والترحيل حتى تُنزَّل مرة واحدة.
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ─────────────────────────────── البناء ───────────────────────────────
FROM deps AS build

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ────────────────────────────── الترحيل ───────────────────────────────
#
# صورة مستقلة لأن `drizzle-kit` اعتمادية تطوير تُحذف من صورة التشغيل،
# ولأن الترحيل يحتاج ملفات `drizzle/` ومخطط `src/db/schema` — ولا شيء
# من ذلك له مكان في العملية التي تخدم الطلبات.
FROM deps AS migrate

ENV NODE_ENV=production
WORKDIR /app

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle

# `scripts/` معها لأن المزامنة والبذر يُشغَّلان من هذه الصورة أيضًا.
COPY scripts ./scripts

# الترحيل ثم مزامنة ما يملكه الكود: الأدوار وقدراتها والمرجعيات الناقصة.
# بدون المزامنة كانت القدرة الجديدة تصل إلى الإنتاج بلا دور يحملها، فيختفي
# القسم الجديد عن الجميع حتى يتذكر أحدهم تشغيل البذر يدويًا.
#
# البذر الكامل — ومعه حساب المدير الأول — يبقى يدويًا لمرة واحدة:
#   docker compose run --rm -e SEED_ADMIN_EMAIL=... migrate npm run db:seed
CMD ["npm", "run", "db:deploy"]

# ───────────────────────────── التشغيل ────────────────────────────────
#
# الـAPI والعامل يتقاسمان هذه الصورة ويختلفان بالأمر فقط: نفس الكود ونفس
# متغيرات البيئة، وعمليتان منفصلتان تُعاد إحداهما دون الأخرى.
FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 4000

CMD ["node", "dist/server.js"]
