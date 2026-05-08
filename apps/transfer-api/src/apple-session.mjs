import { AppleMusicClient } from "../../../dist/providers/apple.js";
import { errorMessage, readJsonBody, sendJson, statusForError } from "./http.mjs";

let runtimeAppleMusicUserToken = "";
let runtimeAppleMusicStorefront = "";

export function createAppleMusicClient(options = {}) {
  const config = currentAppleMusicConfig(options);
  return new AppleMusicClient(
    config.appleMusicDeveloperToken,
    config.appleMusicUserToken,
    config.appleMusicStorefront
  );
}

export function currentAppleMusicConfig(options = {}) {
  const requireUserToken = Boolean(options.requireUserToken);
  const appleMusicDeveloperToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN?.trim();
  const appleMusicUserToken =
    runtimeAppleMusicUserToken || process.env.APPLE_MUSIC_USER_TOKEN?.trim();
  const appleMusicStorefront =
    runtimeAppleMusicStorefront || process.env.APPLE_MUSIC_STOREFRONT?.trim() || "us";

  if (!appleMusicDeveloperToken) {
    throw new Error("Missing APPLE_MUSIC_DEVELOPER_TOKEN. Generate it from your Apple Music private key first.");
  }

  if (requireUserToken && !appleMusicUserToken) {
    throw new Error("Apple Music is not connected. Use Connect Apple Music, then try again.");
  }

  return {
    appleMusicDeveloperToken,
    appleMusicUserToken: appleMusicUserToken || null,
    appleMusicStorefront
  };
}

export function appleMusicSessionPayload() {
  const appleMusicDeveloperToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN?.trim() || "";
  const envUserToken = process.env.APPLE_MUSIC_USER_TOKEN?.trim() || "";
  const appleMusicStorefront =
    runtimeAppleMusicStorefront || process.env.APPLE_MUSIC_STOREFRONT?.trim() || "us";
  const userTokenSource = runtimeAppleMusicUserToken ? "runtime" : envUserToken ? "env" : "none";

  return {
    hasDeveloperToken: Boolean(appleMusicDeveloperToken),
    hasUserToken: Boolean(runtimeAppleMusicUserToken || envUserToken),
    userTokenSource,
    storefront: appleMusicStorefront,
    developerToken: appleMusicDeveloperToken
  };
}

export async function handleAppleMusicUserToken(request, response) {
  try {
    const body = await readJsonBody(request);
    const userToken = String(body.userToken ?? body.musicUserToken ?? "").trim();
    const storefront = String(body.storefront ?? "").trim();

    if (!userToken) {
      sendJson(response, 400, {
        error: true,
        message: "Missing Apple Music user token."
      });
      return;
    }

    runtimeAppleMusicUserToken = userToken;
    runtimeAppleMusicStorefront = storefront || runtimeAppleMusicStorefront;
    sendJson(response, 200, appleMusicSessionPayload());
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}
