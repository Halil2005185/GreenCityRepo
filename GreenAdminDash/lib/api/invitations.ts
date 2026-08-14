import { apiFetch } from "./client";
import type { components } from "./types.gen";

export type Invitation = components["schemas"]["Invitation"];
export type Office = components["schemas"]["Office"];
export type Role = components["schemas"]["Role"];

type CreateInvitationResponse =
  components["schemas"]["CreateInvitationResponse"];

export function listInvitations(status?: Invitation["status"]) {
  const query = status ? `?status=${status}` : "";

  return apiFetch<{ data: Invitation[] }>(`/admin/invitations${query}`).then(
    (response) => response.data,
  );
}

export function createInvitation(input: {
  email: string;
  fullNameAr?: string;
  roleId: string;
  officeId?: string;
  partnerId?: string;
}) {
  return apiFetch<CreateInvitationResponse>("/admin/invitations", {
    method: "POST",
    body: input,
  });
}

export function revokeInvitation(id: string) {
  return apiFetch<void>(`/admin/invitations/${id}/revoke`, { method: "POST" });
}

export function listOffices() {
  return apiFetch<{ data: Office[] }>("/admin/offices").then(
    (response) => response.data,
  );
}

export function listStaffRoles() {
  return apiFetch<{ data: Role[] }>("/admin/roles?scope=STAFF").then(
    (response) => response.data,
  );
}

/** أدوار ممثلي الشركاء — تُستعمل عند دعوة ممثل عن جهة نشطة. */
export function listPartnerRoles() {
  return apiFetch<{ data: Role[] }>("/admin/roles?scope=PARTNER").then(
    (response) => response.data,
  );
}
