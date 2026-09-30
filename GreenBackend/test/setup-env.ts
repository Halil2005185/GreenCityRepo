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

/**
 * مفاتيح تخزين وهمية: التوقيع يجري محليًا بلا شبكة، فيصير شكل الرابط
 * الموقّع قابلًا للفحص في الاختبارات — وهو ما كسره مجموع التحقّق التلقائي
 * مرة، ولا يُكتشف إلا برفع حقيقي لولا ذلك.
 */
process.env.R2_ACCOUNT_ID = 'test-account'
process.env.R2_BUCKET = 'test-bucket'
process.env.R2_ACCESS_KEY_ID = 'test-access-key'
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key'
process.env.R2_PUBLIC_BASE_URL = 'https://media.test'

/**
 * زوج مفاتيح VAPID وُلّد لهذا الملف وحده ولا يوقّع به شيء خارجه: الاختبارات
 * تحقن مُرسِلًا وهميًا، فلا طلب يخرج إلى خدمة إشعار.
 */
process.env.VAPID_PUBLIC_KEY =
  'BMrO1N75pKadcGYAXXatu2NARzkCNj34egQXQS6PZlUp5zOizdfU_Mk2xxcBtCuVtDWTna0m5WLWpqCyS1-o4jA'
process.env.VAPID_PRIVATE_KEY = 'wfFWcP27UeRqdB5qy9e6RaJKKcAzyfaxlUHShu0moLk'
process.env.VAPID_SUBJECT = 'mailto:push@greencities.test'
