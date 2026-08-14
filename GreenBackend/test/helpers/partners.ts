import request from 'supertest'

import { app } from '../../src/app.js'
import { bearer } from './auth.js'

/** ينشئ إصدار ميثاق وينشره، فيصير المرجع الساري للإقرارات. */
export async function publishCharter(adminToken: string, version = '1.0') {
  const created = await request(app)
    .post('/api/admin/charter/versions')
    .set('authorization', bearer(adminToken))
    .send({
      version,
      titleAr: 'ميثاق المدن الخضراء',
      bodyAr:
        'إطار أخلاقي ومجتمعي للتعاون بين المدن الخضراء وشركائها، دون التزامات قانونية أو مالية مباشرة.',
      principlesAr: [
        'حماية البيئة والمساحات العامة',
        'تعزيز المشاركة المجتمعية',
        'تمكين الشباب',
      ],
      commitmentsAr: ['دعم المبادرات البيئية ضمن الإمكانيات المتاحة'],
    })
    .expect(201)

  await request(app)
    .post(`/api/admin/charter/versions/${created.body.id}/publish`)
    .set('authorization', bearer(adminToken))
    .send({})
    .expect(200)

  return created.body.id as string
}

export async function createPartner(
  adminToken: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app)
    .post('/api/admin/partners')
    .set('authorization', bearer(adminToken))
    .send({
      legalNameAr: 'جمعية أصدقاء البيئة',
      organizationKind: 'NGO',
      supportForms: ['COMMUNITY_VOLUNTEERING'],
      ...overrides,
    })
    .expect(201)

  return response.body as { id: string; [key: string]: unknown }
}

/**
 * يمرّ بالجهة عبر شروط التفعيل الثلاثة: جهة اتصال رئيسية، نوع شراكة
 * معتمد، وإقرار بالميثاق الساري.
 */
export async function satisfyActivationRequirements(
  adminToken: string,
  partnerId: string,
  contactEmail = 'contact@partner.test',
) {
  await request(app)
    .post(`/api/admin/partners/${partnerId}/contacts`)
    .set('authorization', bearer(adminToken))
    .send({
      fullNameAr: 'سامي المدير',
      jobTitleAr: 'المدير التنفيذي',
      email: contactEmail,
      isPrimary: true,
    })
    .expect(201)

  const withPartnership = await request(app)
    .post(`/api/admin/partners/${partnerId}/partnerships`)
    .set('authorization', bearer(adminToken))
    .send({ type: 'EXECUTIVE' })
    .expect(201)

  const partnershipId = withPartnership.body.partnerships[0].id as string

  await request(app)
    .patch(`/api/admin/partners/${partnerId}/partnerships/${partnershipId}`)
    .set('authorization', bearer(adminToken))
    .send({ status: 'APPROVED' })
    .expect(200)

  await request(app)
    .post(`/api/admin/partners/${partnerId}/charter-acknowledgements`)
    .set('authorization', bearer(adminToken))
    .send({
      method: 'IN_PERSON',
      acknowledgedByNameAr: 'سامي المدير',
      acknowledgedByTitleAr: 'المدير التنفيذي',
    })
    .expect(201)

  return { partnershipId }
}

/** يدعو ممثلًا عن جهة نشطة ويقبل الدعوة، فيعيد جلسته. */
export async function onboardPartnerRepresentative(
  adminToken: string,
  partnerId: string,
  email: string,
  password: string,
  partnerRoleId: string,
) {
  const invitation = await request(app)
    .post('/api/admin/invitations')
    .set('authorization', bearer(adminToken))
    .send({ email, roleId: partnerRoleId, partnerId })
    .expect(201)

  const token = invitation.body.inviteUrl.split('/').pop() as string

  const accepted = await request(app)
    .post(`/api/auth/invitations/${token}/accept`)
    .send({ fullNameAr: 'ممثل الجهة', password })
    .expect(201)

  return {
    accessToken: accepted.body.accessToken as string,
    user: accepted.body.user,
  }
}
