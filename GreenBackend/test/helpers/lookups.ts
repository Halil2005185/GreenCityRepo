import { and, eq } from 'drizzle-orm'

import { db } from '../../src/db/client.js'
import { lookupLists, lookupValues } from '../../src/db/schema/lookups.js'
import type { LookupCode } from '../../src/modules/lookups/lookups.registry.js'

/**
 * معرّف قيمة من تعريفات النظام برمزها، كما بذرتها المزامنة.
 *
 * المعرّفات تتغير مع كل تهيئة للقاعدة، والرموز ثابتة؛ فالاختبار يكتب
 * «نوع الجهة: جمعية» برمزها كما كان يكتبها قبل أن تصير صفًّا.
 */
export async function lookupValueId(list: LookupCode, code: string) {
  const [row] = await db
    .select({ id: lookupValues.id })
    .from(lookupValues)
    .innerJoin(lookupLists, eq(lookupLists.id, lookupValues.listId))
    .where(and(eq(lookupLists.code, list), eq(lookupValues.code, code)))
    .limit(1)

  if (!row) throw new Error(`Seed lookup value "${list}.${code}" is missing.`)

  return row.id
}
