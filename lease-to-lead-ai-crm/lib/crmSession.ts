import { SignJWT, jwtVerify } from "jose";
import { getSessionSecretBytes, hasSessionSecret } from "./sessionSecret";

export const CRM_SESSION_COOKIE = "crm_session";

export type CrmSessionPayload = {
  sub: string;
  username: string;
  isAdmin: boolean;
};

export async function signCrmSession(payload: CrmSessionPayload): Promise<string> {
  const secret = getSessionSecretBytes();
  if (secret.length === 0) {
    throw new Error("CRM_SESSION_SECRET missing (min 32 chars) or set AUTH_INSECURE_DEV=true for local only");
  }
  return new SignJWT({
    username: payload.username,
    isAdmin: payload.isAdmin
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyCrmSession(token: string): Promise<CrmSessionPayload | null> {
  if (!hasSessionSecret()) return null;
  const secret = getSessionSecretBytes();
  if (secret.length === 0) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const sub = String(payload.sub || "");
    const username = String(payload.username || "");
    const isAdmin = Boolean(payload.isAdmin);
    if (!sub || !username) return null;
    return { sub, username, isAdmin };
  } catch {
    return null;
  }
}
