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

CMD ["npm", "run", "db:migrate"]

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
