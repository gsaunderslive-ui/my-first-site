/**
 * Lets logged-in CRM users inject inbound SMS from the tester UI without Twilio.
 * Production stays off unless you explicitly enable it.
 */
export function isSimulateTenantInboundEnabled(): boolean {
  const v = process.env.CRM_SIMULATE_INBOUND_ENABLED;
  if (v === "true") return true;
  if (v === "false") return false;
  return process.env.NODE_ENV === "development";
}
