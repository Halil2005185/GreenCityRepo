import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * إعداد محوّل OpenNext لنشر اللوحة على Cloudflare Workers.
 *
 * بلا incremental cache عمدًا: لا ISR في اللوحة — كل صفحة إما ساكنة تمامًا
 * أو تُرسم عند الطلب — فلا حاجة إلى R2 أو KV. إن ظهرت صفحة بـ`revalidate`
 * يومًا فاضبط التخزين هنا: https://opennext.js.org/cloudflare/caching
 */
export default defineCloudflareConfig();
