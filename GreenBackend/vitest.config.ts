import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    restoreMocks: true,
    /**
     * ملفات الاختبار تتشارك قاعدة `greencities_test` نفسها وتفرّغها بين
     * الاختبارات، فتشغيلها بالتوازي يجعل ملفًا يمسح صفوف ملف آخر.
     * التسلسل هو الثمن المقبول لاختبارات تكامل حقيقية بدل محاكاة.
     */
    fileParallelism: false,
    // Argon2 وترحيلات القاعدة تجعل بعض الاختبارات أبطأ من الافتراضي.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
