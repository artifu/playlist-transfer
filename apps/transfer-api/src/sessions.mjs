import { sendJson } from "./http.mjs";

export const SESSION_HEADER = "x-playlisttransfer-session";

const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function sessionIdFromRequest(request) {
  const value = String(request.headers[SESSION_HEADER] ?? "").trim();
  return SESSION_ID_PATTERN.test(value) ? value : "";
}

export function requireSessionId(request, response) {
  const sessionId = sessionIdFromRequest(request);

  if (sessionId) return sessionId;

  sendJson(response, 401, {
    error: true,
    message: `Missing ${SESSION_HEADER} header. Generate an anonymous session id on the client and send it with saved-transfer requests.`
  });
  return "";
}
