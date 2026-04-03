import type { CrmSessionPayload } from "./crmSession";
import { CRM_DEV_SESSION_USER_ID } from "./crmConstants";
import { getDefaultCompanyId } from "./crmBootstrap";
import { getCrmUserByUsername } from "./crmUsersDb";

export async function resolveCompanyIdForSession(session: CrmSessionPayload): Promise<string | null> {
  if (session.sub === CRM_DEV_SESSION_USER_ID) {
    return getDefaultCompanyId();
  }
  const row = await getCrmUserByUsername(session.username);
  if (row?.company_id) return row.company_id;
  return getDefaultCompanyId();
}
