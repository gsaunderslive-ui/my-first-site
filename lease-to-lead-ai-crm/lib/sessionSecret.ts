/** Session signing secret — min 32 characters for HS256. */
export function getSessionSecretBytes(): Uint8Array {
  const s = process.env.CRM_SESSION_SECRET;
  if (s && s.length >= 32) {
    return new TextEncoder().encode(s);
  }
  if (process.env.NODE_ENV === "development" && process.env.AUTH_INSECURE_DEV === "true") {
    return new TextEncoder().encode("dev-only-32-char-secret-key!!!!");
  }
  return new TextEncoder().encode("");
}

export function hasSessionSecret(): boolean {
  const s = process.env.CRM_SESSION_SECRET;
  return Boolean(s && s.length >= 32) || (process.env.NODE_ENV === "development" && process.env.AUTH_INSECURE_DEV === "true");
}
