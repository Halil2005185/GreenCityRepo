import { z } from '../../openapi/zod.js'

/**
 * مقدّمة الاستمارة: مستند ProseMirror بقائمة سماح صريحة.
 *
 * لا يُقبل إلا ما تكتبه أدوات المحرّر: فقرة وعنوان فرعي وقائمتان ونصّ
 * بعلامات غامق ومائل ورابط. وكل ما عدا ذلك يُرفض — لا وسم خام، ولا سمة
 * لم تُذكر هنا، ولا عمق يتجاوز قائمةً داخل مستند.
 *
 * والبنية مكتوبة على مستوياتها لا بتكرار ذاتي: العمق محدود بطبعه فلا يحتاج
 * `z.lazy`، ومستند يتداخل بلا قاع كان سيمرّ منه.
 */
const linkMark = z.object({
  type: z.literal('link'),
  attrs: z.object({
    // الروابط النسبية و`javascript:` مرفوضة: العنوان يُفتح في متصفّح زائر.
    href: z.url().max(500).startsWith('http'),
  }),
})

const simpleMark = z.object({ type: z.enum(['bold', 'italic']) })

const textNode = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(2000),
  marks: z.array(z.union([simpleMark, linkMark])).max(3).optional(),
})

const breakNode = z.object({ type: z.literal('hardBreak') })

const inline = z.array(z.union([textNode, breakNode])).max(80)

const paragraph = z.object({
  type: z.literal('paragraph'),
  content: inline.optional(),
})

const heading = z.object({
  type: z.literal('heading'),
  // مستوى واحد: عنوان الاستمارة هو h1، وما دونه قسمٌ لا هرم كامل.
  attrs: z.object({ level: z.literal(3) }),
  content: inline.optional(),
})

const listItem = z.object({
  type: z.literal('listItem'),
  content: z.array(paragraph).min(1).max(4),
})

const list = z.object({
  type: z.enum(['bulletList', 'orderedList']),
  content: z.array(listItem).min(1).max(30),
})

export const introDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.union([paragraph, heading, list])).max(40),
})

export type IntroDoc = z.infer<typeof introDocSchema>
