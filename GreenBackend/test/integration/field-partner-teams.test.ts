import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../../src/app.js'
import { db } from '../../src/db/client.js'
import { auditLogs } from '../../src/db/schema/audit.js'
import { roles } from '../../src/db/schema/org.js'
import { TEST_PASSWORD, bearer } from '../helpers/auth.js'
import { closeTestDatabase, ensureTestDatabase } from '../helpers/database.js'
import {
  type FieldStage,
  addPeople,
  adminField,
  bootstrapField,
  createGroup,
  fieldPost,
  newClientId,
} from '../helpers/field.js'
import {
  addSite,
  createInitiative,
  programIdBySlug,
} from '../helpers/operational.js'
import {
  createPartner,
  onboardPartnerRepresentative,
  publishCharter,
  satisfyActivationRequirements,
} from '../helpers/partners.js'

const ready = await ensureTestDatabase()

afterAll(async () => {
  await closeTestDatabase()
})

type Group = {
  id: string
  nameAr: string
  partnerId: string | null
  partnerNameAr: string | null
}

type Team = {
  groupId: string
  groupNameAr: string
  initiativeNameAr: string
  siteNameAr: string
  memberCount: number
  comingCount: number
  attendedCount: number
  attendanceDays: number
  lastAttendedOn: string | null
}

describe.runIf(ready)('partner teams in the field', () => {
  let stage: FieldStage
  let company: { id: string; rep: string }
  let society: { id: string; rep: string }
  let prospect: { id: string }

  async function activePartner(legalNameAr: string, email: string) {
    const partner = await createPartner(stage.director, { legalNameAr })

    await satisfyActivationRequirements(stage.director, partner.id, email)
    await request(app)
      .post(`/api/admin/partners/${partner.id}/activate`)
      .set('authorization', bearer(stage.director))
      .expect(200)

    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.slug, 'PARTNER_ADMIN'))

    const rep = await onboardPartnerRepresentative(
      stage.director,
      partner.id,
      email,
      TEST_PASSWORD,
      role!.id,
    )

    return { id: partner.id, rep: rep.accessToken }
  }

  const teamsOf = async (token: string) =>
    (
      await request(app)
        .get('/api/partner/me/field-teams')
        .set('authorization', bearer(token))
        .expect(200)
    ).body.data as Team[]

  const patchGroup = (groupId: string, body: Record<string, unknown>) =>
    request(app)
      .patch(adminField(stage.initiativeId, `/groups/${groupId}`))
      .set('authorization', bearer(stage.director))
      .send(body)

  beforeAll(async () => {
    stage = await bootstrapField()
    await publishCharter(stage.director)

    company = await activePartner('شركة الشام للاتصالات', 'rep@company.test')
    society = await activePartner('جمعية الندى', 'rep@society.test')
    prospect = await createPartner(stage.director, {
      legalNameAr: 'جهة لم تُعتمد بعد',
    })
  })

  it('offers only active partners to the coordinator', async () => {
    const response = await request(app)
      .get(adminField(stage.initiativeId, '/partner-options'))
      .set('authorization', bearer(stage.director))
      .expect(200)

    const names = (
      response.body.data as Array<{ id: string; displayNameAr: string }>
    ).map((option) => option.displayNameAr)

    expect(names.sort()).toEqual(['جمعية الندى', 'شركة الشام للاتصالات'].sort())
    // اسم الجهة ونوعها وحدهما: لا ملاحظات ولا مسؤول علاقة.
    expect(Object.keys(response.body.data[0]).sort()).toEqual(
      ['displayNameAr', 'id', 'organizationKindNameAr'].sort(),
    )
  })

  it('names the partner of a group when it is created and when it changes', async () => {
    const group = (await createGroup(stage.director, stage.initiativeId, {
      siteId: stage.siteId,
      nameAr: 'فريق الشام',
      leadUserId: stage.lead.userId,
      partnerId: company.id,
    })) as unknown as Group

    expect(group).toMatchObject({
      partnerId: company.id,
      partnerNameAr: 'شركة الشام للاتصالات',
    })

    const moved = await patchGroup(group.id, { partnerId: society.id }).expect(
      200,
    )

    expect(
      (moved.body.groups as Group[]).find((row) => row.id === group.id),
    ).toMatchObject({ partnerId: society.id, partnerNameAr: 'جمعية الندى' })

    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, group.id))
      .orderBy(auditLogs.createdAt)
      .then((rows) => rows.slice(-1))

    expect(entry!.metadata).toMatchObject({
      previousPartnerId: company.id,
      partnerId: society.id,
    })

    const cleared = await patchGroup(group.id, { partnerId: null }).expect(200)

    expect(
      (cleared.body.groups as Group[]).find((row) => row.id === group.id),
    ).toMatchObject({ partnerId: null, partnerNameAr: null })

    await patchGroup(group.id, { partnerId: company.id }).expect(200)
  })

  it('refuses a partner that is not active', async () => {
    const response = await request(app)
      .post(adminField(stage.initiativeId, '/groups'))
      .set('authorization', bearer(stage.director))
      .send({
        siteId: stage.siteId,
        nameAr: 'فريق جهة لم تُعتمد',
        partnerId: prospect.id,
      })
      .expect(422)

    expect(JSON.stringify(response.body)).toContain('partnerId')

    await request(app)
      .post(adminField(stage.initiativeId, '/groups'))
      .set('authorization', bearer(stage.director))
      .send({
        siteId: stage.siteId,
        nameAr: 'فريق جهة لا وجود لها',
        partnerId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(422)
  })

  describe('in the partner portal', () => {
    let teamId: string

    beforeAll(async () => {
      teamId = (
        await createGroup(stage.director, stage.initiativeId, {
          siteId: stage.siteId,
          nameAr: 'فريق الندى',
          leadUserId: stage.lead.userId,
          partnerId: society.id,
          meetsAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
      ).id

      const { members } = await addPeople(
        stage.director,
        stage.initiativeId,
        teamId,
        [
          { fullNameAr: 'هبة الأحمد', phone: '0944 123 456' },
          { fullNameAr: 'سامر عيسى', phone: '0944 222 333' },
          { fullNameAr: 'لينا حداد', email: 'lina@example.test' },
        ],
      )

      for (const member of members.slice(0, 2)) {
        await fieldPost(stage.lead.token, `/groups/${teamId}/attendance`, {
          clientId: newClientId(),
          participantId: member.participantId,
        }).expect(200)
      }

      // حضور تُرجع عنه لا يُعدّ.
      const undone = await fieldPost(
        stage.lead.token,
        `/groups/${teamId}/attendance`,
        { clientId: newClientId(), participantId: members[2]!.participantId },
      ).expect(200)

      await fieldPost(stage.lead.token, `/groups/${teamId}/attendance/undo`, {
        attendanceId: undone.body.id,
      }).expect(200)
    })

    it('shows the partner its own teams with their counts', async () => {
      const teams = await teamsOf(society.rep)
      const team = teams.find((row) => row.groupId === teamId)!

      expect(team).toMatchObject({
        groupNameAr: 'فريق الندى',
        initiativeNameAr: 'حملة الميدان التجريبية',
        siteNameAr: 'حديقة تشرين',
        memberCount: 3,
        comingCount: 0,
        attendedCount: 2,
        attendanceDays: 2,
      })
      expect(team.lastAttendedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    /**
     * المتطوع أعطى بياناته للمشروع لا للجهة التي جاء معها: الجهة تعرف كم
     * حضر من فريقها، لا من.
     */
    it('never names a volunteer', async () => {
      const response = await request(app)
        .get('/api/partner/me/field-teams')
        .set('authorization', bearer(society.rep))
        .expect(200)

      const text = JSON.stringify(response.body)

      for (const secret of ['هبة', 'سامر', 'لينا', '0944', 'example.test']) {
        expect(text).not.toContain(secret)
      }
    })

    it('keeps each partner to its own teams', async () => {
      const theirs = await teamsOf(company.rep)

      expect(theirs.map((row) => row.groupNameAr)).toEqual(['فريق الشام'])
      expect(theirs.some((row) => row.groupId === teamId)).toBe(false)
    })

    it('hides a team of a campaign that has not started', async () => {
      const program = await programIdBySlug('tree-planting')
      const draft = await createInitiative(stage.director, {
        programId: program.id,
        nameAr: 'حملة لم تبدأ',
      })
      const site = await addSite(stage.director, draft['id'], {
        nameAr: 'موقع لم يبدأ',
      })

      await createGroup(stage.director, draft['id'], {
        siteId: site.id,
        nameAr: 'فريق ينتظر',
        partnerId: society.id,
      })

      const names = (await teamsOf(society.rep)).map((row) => row.groupNameAr)

      expect(names).toContain('فريق الندى')
      expect(names).not.toContain('فريق ينتظر')
    })

    it('drops a team once it is no longer the partner’s', async () => {
      await patchGroup(teamId, { partnerId: null }).expect(200)

      expect((await teamsOf(society.rep)).map((row) => row.groupId)).not.toContain(
        teamId,
      )

      await patchGroup(teamId, { partnerId: society.id }).expect(200)
    })

    it('is for partner representatives only', async () => {
      await request(app)
        .get('/api/partner/me/field-teams')
        .set('authorization', bearer(stage.director))
        .expect(403)

      await request(app)
        .get('/api/partner/me/field-teams')
        .set('authorization', bearer(stage.lead.token))
        .expect(403)

      await request(app).get('/api/partner/me/field-teams').expect(401)
    })

    it('keeps the team and its history when the partner is suspended', async () => {
      await request(app)
        .post(`/api/admin/partners/${society.id}/suspend`)
        .set('authorization', bearer(stage.director))
        .send({ suspensionReasonAr: 'مراجعة دورية للشراكة' })
        .expect(200)

      // المعلَّقة تقرأ بوابتها، ولا تُنسب إليها مجموعة جديدة.
      expect(
        (await teamsOf(society.rep)).map((row) => row.groupId),
      ).toContain(teamId)

      await request(app)
        .post(adminField(stage.initiativeId, '/groups'))
        .set('authorization', bearer(stage.director))
        .send({
          siteId: stage.siteId,
          nameAr: 'فريق جهة معلّقة',
          partnerId: society.id,
        })
        .expect(422)
    })
  })
})
