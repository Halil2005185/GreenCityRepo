import 'dotenv/config'

process.env.NODE_ENV = 'test'

/**
 * الاختبارات تُفرّغ الجداول بين الحالات، فلا تلمس قاعدة التطوير أبدًا.
 *
 * الإسناد صريح لا `??=`: تحميل `.env` قبله يملأ `DATABASE_URL` بقاعدة
 * التطوير، و`??=` كان سيُبقيها فتُمحى بيانات حقيقية عند أول تشغيل.
 * وحارس `assertTestDatabase` يرفض أي اسم قاعدة لا ينتهي بـ`_test`.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://greencities_app:CHANGE_ME@127.0.0.1:5432/greencities_test'

process.env.DATABASE_REQUIRED_ON_START = 'false'

// أسرار ثابتة للاختبارات وحدها. لا تُستعمل خارج هذا الملف.
process.env.JWT_ACCESS_SECRET =
  'test-only-secret-not-used-anywhere-else-0123456789'
process.env.AUTH_COOKIE_SECURE = 'false'

// القفل بعد ثلاث محاولات يجعل اختبار القفل أسرع دون إضعاف الافتراض الحقيقي.
process.env.AUTH_MAX_FAILED_LOGINS = '3'
