/**
 * القدرات المستعملة في هذه الواجهة. القائمة ليست نسخة من كتالوج الخادم،
 * بل ما تحتاجه الشاشات فعلًا لإخفاء عنصر أو إظهاره.
 *
 * الإخفاء تحسين تجربة لا حماية: الخادم يعيد فحص كل طلب في `requireCapability`.
 * زر مخفي لا يمنع أحدًا من نداء الـAPI مباشرة، والاعتماد عليه وحده ثغرة.
 */
export const CAPABILITIES = {
  usersView: "users.view",
  usersManage: "users.manage",
  invitationsManage: "invitations.manage",
  rolesManage: "roles.manage",
  officesManage: "offices.manage",

  partnersView: "partners.view",
  partnersManage: "partners.manage",
  partnersApprove: "partners.approve",
  partnersConsentManage: "partners.consent.manage",
  partnersNotesView: "partners.notes.view",

  charterManage: "charter.manage",
  charterAcknowledgementsRecord: "charter.acknowledgements.record",

  partnerProfileManage: "partner.profile.manage",
  partnerConsentManage: "partner.consent.manage",

  programsManage: "programs.manage",
  geoManage: "geo.manage",

  initiativesView: "initiatives.view",
  initiativesManage: "initiatives.manage",
  initiativesLaunch: "initiatives.launch",

  workView: "work.view",
  workManage: "work.manage",
  workApprove: "work.approve",

  contributionsView: "contributions.view",
  contributionsVerify: "contributions.verify",
  contributionsValueView: "contributions.value.view",

  impactView: "impact.view",
  impactManage: "impact.manage",
  metricsManage: "metrics.manage",

  formsView: "forms.view",
  formsManage: "forms.manage",
  formsPublish: "forms.publish",

  reportsView: "reports.view",
  auditView: "audit.view",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];
