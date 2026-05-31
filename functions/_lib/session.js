export const SESSION_HEADER = "x-playlisttransfer-session";

const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function sessionIdFromRequest(request) {
  const value = String(request.headers.get(SESSION_HEADER) ?? "").trim();
  return SESSION_ID_PATTERN.test(value) ? value : "";
}

export function requireSessionId(request) {
  const sessionId = sessionIdFromRequest(request);
  if (sessionId) return sessionId;

  throw new Error(`Missing ${SESSION_HEADER} header. Generate an anonymous session id on the client and send it with saved-transfer requests.`);
}

