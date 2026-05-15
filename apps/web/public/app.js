const input = document.querySelector("#playlist-input");
const form = document.querySelector("#transfer-form");
const analysisLimit = document.querySelector("#analysis-limit");
const previewButton = document.querySelector("#preview-button");
const analyzeButton = document.querySelector("#analyze-button");
const createButton = document.querySelector("#create-button");
const connectAppleButton = document.querySelector("#connect-apple");
const appleCard = document.querySelector("#apple-card");
const appleState = document.querySelector("#apple-state");
const progressCard = document.querySelector("#progress-card");
const progressPhase = document.querySelector("#progress-phase");
const progressPercent = document.querySelector("#progress-percent");
const progressBar = document.querySelector("#progress-bar");
const progressDetail = document.querySelector("#progress-detail");
const statusLine = document.querySelector("#status-line");
const results = document.querySelector("#results");
const fallbackGuide = document.querySelector("#fallback-guide");
const toast = document.querySelector("#toast");
const STORED_TRANSFER_ID_KEY = "playlist-transfer:last-transfer-id";
const STORED_SESSION_ID_KEY = "playlist-transfer:anonymous-session-id";
const SESSION_HEADER = "X-PlaylistTransfer-Session";

const state = {
  appleSession: null,
  busy: false,
  preview: null,
  previewInput: null,
  analysis: null,
  analysisInput: null,
  transferId: null,
  anonymousSessionId: null
};

let toastTimer = null;
let musicKitLoadPromise = null;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function duration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.round(ms / 1000);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function percent(value) {
  return typeof value === "number" ? Math.round(value * 100) + "%" : "";
}

function artistText(track) {
  return Array.isArray(track?.artists) ? track.artists.join(", ") : "";
}

function artworkHtml(source, size = "small") {
  const url = source?.albumImageUrl || source?.imageUrl;
  if (!url) return `<div class="sleeve ${esc(size)}"></div>`;
  return `<img class="artwork ${esc(size)}" src="${esc(url)}" alt="" loading="lazy" />`;
}

function applePillHtml() {
  return `<span class="service-pill apple" aria-label="Apple Music"><span aria-hidden="true">♪</span></span>`;
}

function appleMusicPlaylistUrl(playlistId) {
  return `https://music.apple.com/library/playlist/${encodeURIComponent(String(playlistId || ""))}`;
}

function spotifyPlaylistIdFromValue(value) {
  const trimmed = String(value || "").trim();
  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.indexOf("playlist");
    if (playlistIndex >= 0 && parts[playlistIndex + 1]) return parts[playlistIndex + 1];
  } catch {
    const looseMatch = trimmed.match(/playlist\/([A-Za-z0-9]+)/);
    if (looseMatch) return looseMatch[1];
  }

  return "";
}

function destinationPlaylistName(data) {
  return `${data.playlist?.name || "Playlist"} (Transferred from Spotify)`;
}

function analyzedScopeText(data) {
  const analyzed = data.playlist?.analyzedTrackCount || data.items?.length || data.summary?.matchedCount || 0;
  const original = data.playlist?.originalTotalItems;

  if (data.playlist?.partialAnalysis && original) {
    return `${analyzed} of ${original} readable tracks`;
  }

  return `${analyzed} readable tracks`;
}

function renderStartState({ hasInput = false } = {}) {
  results.className = "result-empty";
  results.innerHTML = hasInput
    ? `
      <p class="eyebrow">New link ready</p>
      <h2>Preview this Spotify playlist before matching.</h2>
      <p>Tap the arrow in the URL box to load the public playlist details, then we will search Apple Music.</p>
    `
    : `
      <p class="eyebrow">Trust-first transfer</p>
      <h2>Nothing moves until you approve the match report.</h2>
      <p>Preview the Spotify playlist, analyze Apple Music candidates, review anything fuzzy, then create from clean matches only.</p>
    `;
}

function showToast(message, kind = "info") {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast visible ${kind}`;
  toastTimer = window.setTimeout(() => {
    toast.className = `toast ${kind}`;
  }, 2600);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function summaryProperties(data = {}) {
  return {
    transferId: data.transferId || data.transfer?.id || state.transferId || "",
    totalTracks: data.playlist?.originalTotalItems || data.playlist?.totalItems || data.items?.length || data.tracks?.length || 0,
    readableTracks: data.playlist?.analyzedTrackCount || data.items?.length || data.tracks?.length || 0,
    withIsrcCount: Array.isArray(data.tracks)
      ? data.tracks.filter((track) => track.isrc).length
      : undefined,
    readyCount: data.summary?.confidentMatchCount,
    reviewCount: data.summary?.needsReviewCount,
    missingCount: data.summary?.unmatchedCount,
    matchRate: data.summary?.matchRate,
    playlistSource: data.playlist?.source
  };
}

function analyticsContext(properties = {}) {
  return {
    path: window.location.pathname,
    host: window.location.host,
    playlistId: spotifyPlaylistIdFromValue(input.value),
    analysisLimit: analysisLimit.value,
    transferId: state.transferId || "",
    ...properties
  };
}

function trackEvent(event, properties = {}) {
  try {
    void fetch("/api/events", {
      method: "POST",
      cache: "no-store",
      keepalive: true,
      headers: sessionHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        event,
        properties: analyticsContext(properties)
      })
    }).catch(() => {
      // Analytics should never interrupt the transfer flow.
    });
  } catch {
    // Ignore analytics failures; the transfer experience is more important.
  }
}

async function loadMusicKitScript() {
  if (window.MusicKit) return;
  if (musicKitLoadPromise) return musicKitLoadPromise;

  musicKitLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("MusicKit did not load. Refresh the page or try Safari/Chrome."));
    document.head.append(script);
  });

  return musicKitLoadPromise;
}

function setStatus(message, kind = "info") {
  statusLine.textContent = message;
  statusLine.className = kind === "error" ? "status-line error" : "status-line";
}

function hasDeveloperToken() {
  return Boolean(state.appleSession?.hasDeveloperToken);
}

function appleSessionIsKnown() {
  return state.appleSession !== null;
}

function hasAppleMusicConnection() {
  return Boolean(state.appleSession?.hasDeveloperToken && state.appleSession?.hasUserToken);
}

function canCreate() {
  const inputValue = input.value.trim();
  return Boolean(
    state.analysis &&
    state.analysisInput === inputValue &&
    !state.analysis.createdApplePlaylistId &&
    (state.analysis.summary?.confidentMatchCount ?? 0) > 0
  );
}

function refreshActions() {
  const inputValue = input.value.trim();
  const hasInput = Boolean(inputValue);
  const hasPreviewForInput = Boolean(
    (state.preview && state.previewInput === inputValue) ||
    (state.analysis && state.analysisInput === inputValue)
  );
  previewButton.disabled = state.busy || !hasInput;
  analyzeButton.disabled = state.busy || !hasPreviewForInput || (appleSessionIsKnown() && !hasDeveloperToken());
  analyzeButton.classList.toggle("ready", !analyzeButton.disabled);
  createButton.disabled = state.busy || !canCreate();
  connectAppleButton.disabled = state.busy || (appleSessionIsKnown() && !hasDeveloperToken());
}

function renderAppleSession() {
  const session = state.appleSession;

  if (!session) {
    appleCard.className = "apple-card";
    appleState.textContent = "Not connected yet. We will ask only when you create the playlist.";
    connectAppleButton.textContent = "Connect Apple Music";
    refreshActions();
    return;
  }

  if (!session?.hasDeveloperToken) {
    appleCard.className = "apple-card blocked";
    appleState.textContent = "Developer token missing. Start the Transfer API with Apple credentials before matching.";
    connectAppleButton.textContent = "Developer token required";
    refreshActions();
    return;
  }

  if (!session.hasUserToken) {
    appleCard.className = "apple-card";
    appleState.textContent = "Not connected yet. We will ask only when you create the playlist.";
    connectAppleButton.textContent = "Connect Apple Music";
    refreshActions();
    return;
  }

  const source = session.userTokenSource === "runtime" ? "this browser session" : "local environment";
  appleCard.className = "apple-card connected";
  appleState.textContent = `Connected from ${source} for storefront ${session.storefront || "us"}.`;
  connectAppleButton.textContent = "Reconnect Apple Music";
  refreshActions();
}

function createSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function anonymousSessionId() {
  try {
    const stored = window.localStorage.getItem(STORED_SESSION_ID_KEY);
    if (stored) return stored;

    const sessionId = createSessionId();
    window.localStorage.setItem(STORED_SESSION_ID_KEY, sessionId);
    return sessionId;
  } catch {
    if (!state.anonymousSessionId) state.anonymousSessionId = createSessionId();
    return state.anonymousSessionId;
  }
}

function sessionHeaders(headers = {}) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set(SESSION_HEADER, anonymousSessionId());
  return nextHeaders;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: sessionHeaders(options.headers)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

async function postJson(path, body) {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function readStoredTransferId() {
  try {
    return window.localStorage.getItem(STORED_TRANSFER_ID_KEY);
  } catch {
    return null;
  }
}

function rememberTransferId(transferId) {
  state.transferId = transferId || null;

  try {
    if (state.transferId) {
      window.localStorage.setItem(STORED_TRANSFER_ID_KEY, state.transferId);
    } else {
      window.localStorage.removeItem(STORED_TRANSFER_ID_KEY);
    }
  } catch {
    // localStorage may be blocked; the server-side transfer still works in-session.
  }
}

function clearStoredTransfer() {
  rememberTransferId(null);
}

function adoptAnalysis(data) {
  state.analysis = data;
  state.analysisInput = data.transfer?.input || input.value.trim() || null;
  rememberTransferId(data.transferId || data.transfer?.id || null);

  if (data.transfer?.input) {
    input.value = data.transfer.input;
  }

  if (data.transfer?.analysisLimit) {
    analysisLimit.value = String(data.transfer.analysisLimit);
  }
}

async function loadAppleSession() {
  try {
    state.appleSession = await apiFetch("/api/apple-music/session");
  } catch (error) {
    state.appleSession = {
      hasDeveloperToken: false,
      hasUserToken: false,
      userTokenSource: "none",
      storefront: "us",
      developerToken: ""
    };
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    renderAppleSession();
  }
}

async function ensureAppleSession() {
  if (!state.appleSession) {
    await loadAppleSession();
  }

  return state.appleSession;
}

async function ensureDeveloperTokenForAnalysis() {
  await ensureAppleSession();

  if (!hasDeveloperToken()) {
    setStatus("Apple Music developer token is missing. The API needs Apple credentials before matching.", "error");
    return false;
  }

  return true;
}

async function saveAppleUserToken(userToken) {
  state.appleSession = await postJson("/api/apple-music/user-token", {
    userToken,
    storefront: state.appleSession?.storefront || "us"
  });
  renderAppleSession();
}

async function connectAppleMusic() {
  await ensureAppleSession();

  if (!state.appleSession?.developerToken) {
    setStatus("Apple Music developer token is missing.", "error");
    return false;
  }

  const startedAt = performance.now();
  trackEvent("apple_connect_started", {
    hasDeveloperToken: true,
    appleConnected: hasAppleMusicConnection()
  });
  setBusy(true, "Opening Apple Music authorization...");

  try {
    await loadMusicKitScript();

    await MusicKit.configure({
      developerToken: state.appleSession.developerToken,
      app: {
        name: "PlaylistTransfer",
        build: "web-mvp"
      },
      storefrontId: state.appleSession.storefront || "us",
      suppressErrorDialog: false
    });

    const music = MusicKit.getInstance();
    const authorizedToken = await music.authorize();
    const resolvedToken =
      authorizedToken ||
      music.musicUserToken ||
      music.api?.musicUserToken ||
      window.MusicKit?.getInstance?.()?.musicUserToken;

    if (!resolvedToken) {
      throw new Error("Apple authorization finished, but MusicKit did not return a user token.");
    }

    await saveAppleUserToken(resolvedToken);
    setStatus("Apple Music connected. Create can now write the playlist.", "success");
    showToast("Apple Music connected.", "success");
    trackEvent("apple_connect_succeeded", {
      durationMs: elapsedMs(startedAt),
      hasDeveloperToken: true,
      appleConnected: true
    });
    return true;
  } catch (error) {
    console.error(error);
    setStatus(errorMessage(error), "error");
    showToast("Apple Music was not connected.", "error");
    trackEvent("apple_connect_failed", {
      durationMs: elapsedMs(startedAt),
      errorCategory: "apple_authorization",
      errorMessage: errorMessage(error),
      hasDeveloperToken: true,
      appleConnected: false
    });
    return false;
  } finally {
    setBusy(false);
  }
}

async function ensureAppleMusicForCreate() {
  await ensureAppleSession();
  if (hasAppleMusicConnection()) return true;
  setStatus("Connect Apple Music to create this playlist in your library.");
  return connectAppleMusic();
}

function setBusy(isBusy, message) {
  state.busy = isBusy;
  refreshActions();
  if (typeof message === "string") setStatus(message);
}

function setProgress(job) {
  const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  progressCard.hidden = false;
  progressPhase.textContent = job.phase || "Working";
  progressPercent.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;
  progressDetail.textContent = job.total
    ? `${job.completed} of ${job.total} tracks processed.`
    : "Preparing playlist metadata.";
}

function resetProgress() {
  progressCard.hidden = true;
  progressPhase.textContent = "Preparing";
  progressPercent.textContent = "0%";
  progressBar.style.width = "0%";
  progressDetail.textContent = "Waiting to start.";
}

async function startJob(path, body) {
  const job = await postJson(path, body);
  setProgress(job);

  for (let pollCount = 0; pollCount < 900; pollCount += 1) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const current = await apiFetch(`/api/jobs/${encodeURIComponent(job.id)}`);
    setProgress(current);

    if (current.status === "complete") return current.result;
    if (current.status === "error") throw new Error(current.error || "Job failed.");
  }

  throw new Error("Timed out waiting for the transfer job.");
}

function sourceNote(data) {
  if (!data.playlist?.source) return "";
  const limitation = (data.playlist.limitations || [])[0] || "";
  return `<div class="trust-note">Source: ${esc(data.playlist.source)}. ${esc(limitation)}</div>`;
}

function partialNote(data) {
  if (!data.playlist?.partialAnalysis) return "";
  return `<div class="trust-note warn">This report analyzed ${esc(data.playlist.analyzedTrackCount)} of ${esc(data.playlist.originalTotalItems)} readable tracks. Create will only transfer ready tracks from this analyzed scope.</div>`;
}

function rowsNote(total, rendered) {
  if (total <= rendered) return "";
  return `<div class="trust-note warn">Showing ${rendered} rows here. The report contains all ${total} rows.</div>`;
}

function statusLabel(statusValue) {
  if (statusValue === "matched") return "Ready";
  if (statusValue === "needs_review") return "Review";
  return "Missing";
}

function toneForStatus(statusValue) {
  if (statusValue === "matched") return "ready";
  if (statusValue === "needs_review") return "review";
  return "missing";
}

function renderPreview(data) {
  const renderedTracks = data.tracks.slice(0, 18);
  const playlistArtwork = {
    albumImageUrl: data.playlist.imageUrl || data.tracks.find((track) => track.albumImageUrl)?.albumImageUrl
  };
  const rows = renderedTracks.map((track, index) => `
    <div class="track-row">
      <div class="track-index">${String(index + 1).padStart(2, "0")}</div>
      ${artworkHtml(track)}
      <div class="track-body">
        <div class="track-title">${esc(track.name)}</div>
        <div class="track-meta">${esc(artistText(track))}${track.album ? " - " + esc(track.album) : ""}</div>
      </div>
      <div class="track-duration">${duration(track.durationMs)}</div>
    </div>
  `).join("");

  results.className = "screen";
  results.innerHTML = `
    <div class="screen-head">
      <p class="eyebrow"><span class="service-pill spotify">S</span> We found your playlist</p>
      <h2 class="screen-title">Here is what we will be working with.</h2>
      <p class="screen-copy">Nothing has moved yet. The next step searches Apple Music and builds a match report.</p>
    </div>
    <div class="playlist-card">
      ${artworkHtml(playlistArtwork, "big")}
      <div>
        <p class="eyebrow">Public Spotify playlist</p>
        <div class="playlist-name">${esc(data.playlist.name)}</div>
        <div class="playlist-meta">
          <span>${data.tracks.length} readable tracks</span>
          <span>${data.tracks.filter((track) => track.isrc).length} with ISRC</span>
        </div>
      </div>
    </div>
    <div class="route-card">
      <span class="service-pill spotify">S</span>
      <span class="eyebrow">to</span>
      ${applePillHtml()}
      <div class="route-copy">Will create a new Apple Music playlist after review.</div>
    </div>
    ${sourceNote(data)}
    <section class="group-section">
      <h3 class="group-title">First tracks</h3>
      <div class="track-list">${rows}</div>
    </section>
    ${rowsNote(data.tracks.length, renderedTracks.length)}
  `;
}

function renderMetrics(data) {
  const anyMatchRate = data.summary?.matchRate ?? 0;
  return `
    <div class="metric-grid">
      <div class="metric-card ready"><div class="metric-label">Ready</div><div class="metric-value">${esc(data.summary.confidentMatchCount)}</div></div>
      <div class="metric-card review"><div class="metric-label">Review</div><div class="metric-value">${esc(data.summary.needsReviewCount)}</div></div>
      <div class="metric-card missing"><div class="metric-label">Missing</div><div class="metric-value">${esc(data.summary.unmatchedCount)}</div></div>
      <div class="metric-card"><div class="metric-label">Any match</div><div class="metric-value">${percent(anyMatchRate)}</div></div>
    </div>
  `;
}

function renderCandidateOptions(item) {
  const candidates = item.candidates ?? [];
  if (candidates.length <= 1) return "";

  return `
    <details class="candidate-options">
      <summary>Browse ${candidates.length - 1} other candidate${candidates.length === 2 ? "" : "s"}</summary>
      ${candidates.map((candidate, index) => `
        <div class="candidate-option">
          <div>
            <div class="track-title">${esc(candidate.name)}</div>
            <div class="track-meta">${esc(candidate.artistName)}${candidate.albumName ? " - " + esc(candidate.albumName) : ""}</div>
          </div>
          <button class="mini-action use-candidate" type="button" data-review-action="use-candidate" data-review-index="${item.index}" data-candidate-index="${index}">Use this</button>
        </div>
      `).join("")}
    </details>
  `;
}

function renderMatchRow(item) {
  const source = item.source;
  const candidate = item.appleCandidate;
  const tone = toneForStatus(item.status);
  const approveButton = candidate
    ? `<button class="mini-action approve" type="button" data-review-action="approve" data-review-index="${item.index}">Approve suggested</button>`
    : "";
  const reviewActions = item.status === "needs_review" || item.status === "unmatched"
    ? `<div class="review-actions">${approveButton}<button class="mini-action skip" type="button" data-review-action="skip" data-review-index="${item.index}">Skip track</button></div>${renderCandidateOptions(item)}`
    : "";
  const candidateHtml = candidate
    ? `<div class="candidate-card ${tone}">
        <div class="candidate-label">Apple Music candidate</div>
        <div class="track-title">${esc(candidate.name)}</div>
        <div class="track-meta">${esc(candidate.artistName)}${candidate.albumName ? " - " + esc(candidate.albumName) : ""}</div>
        <div class="track-meta mono">${esc(item.reason || "")}</div>
      </div>`
    : `<div class="candidate-card missing">
        <div class="candidate-label">No confident match</div>
        <div class="track-meta">${esc(item.reason || "No candidate selected.")}</div>
      </div>`;

  return `
    <div class="track-row">
      <div class="track-index">${esc(item.index)}</div>
      ${artworkHtml(source)}
      <div class="track-body">
        <div class="track-title">${esc(source.name)}</div>
        <div class="track-meta">${esc(artistText(source))}${source.album ? " - " + esc(source.album) : ""}</div>
        <div class="status-pill ${esc(item.status)}">${statusLabel(item.status)}</div>
        ${candidateHtml}
        ${reviewActions}
      </div>
      <div class="confidence">${percent(item.confidence)}</div>
    </div>
  `;
}

function renderMatchGroup(label, items, tone, renderLimit) {
  if (!items.length) return "";
  const visible = items.slice(0, renderLimit);
  const hiddenCount = items.length - visible.length;
  const more = hiddenCount > 0
    ? `<div class="track-row"><div></div><div></div><div class="track-meta mono">+ ${hiddenCount} more ${esc(label.toLowerCase())} tracks in the full report.</div><div></div></div>`
    : "";

  return `
    <section class="group-section ${tone}">
      <h3 class="group-title">${esc(label)} - ${items.length}</h3>
      <div class="track-list">${visible.map(renderMatchRow).join("")}${more}</div>
    </section>
  `;
}

function renderAnalysis(data) {
  const renderedItems = data.items.slice(0, 180);
  const review = renderedItems.filter((item) => item.status === "needs_review");
  const missing = renderedItems.filter((item) => item.status === "unmatched");
  const ready = renderedItems.filter((item) => item.status === "matched");
  const readyRate = data.items.length === 0 ? 0 : data.summary.confidentMatchCount / data.items.length;
  const transferNote = data.summary.confidentMatchCount > 0
    ? `<div class="trust-note">Create will transfer ${data.summary.confidentMatchCount} ready tracks from this report. Review and missing tracks stay out unless you approve them first.</div>`
    : `<div class="trust-note warn">No tracks are ready yet. Approve suggested review rows or try another playlist before creating.</div>`;

  results.className = "screen";
  results.innerHTML = `
    <div class="screen-head">
      <p class="eyebrow">Step 2 of 3 - Match report</p>
      <h2 class="screen-title">${percent(readyRate)} ready to transfer cleanly.</h2>
      <p class="screen-copy">We matched ${data.summary.confidentMatchCount} of ${data.items.length} tracks confidently. ${data.summary.needsReviewCount} need a quick look. ${data.summary.unmatchedCount} will not transfer.</p>
    </div>
    ${renderMetrics(data)}
    ${partialNote(data)}
    ${sourceNote(data)}
    ${transferNote}
    ${renderMatchGroup("Needs review", review, "review", 32)}
    ${renderMatchGroup("Will not transfer", missing, "missing", 32)}
    ${renderMatchGroup("Ready to transfer", ready, "ready", 90)}
    ${rowsNote(data.items.length, renderedItems.length)}
  `;
}

function renderSuccess(data, createdApplePlaylistId) {
  const notTransferred = data.summary.needsReviewCount + data.summary.unmatchedCount;
  const destinationName = destinationPlaylistName(data);
  const scope = analyzedScopeText(data);
  results.className = "screen";
  results.innerHTML = `
    <div class="success-hero">
      <div class="success-badge">Transfer complete</div>
      <h2 class="success-title">${esc(data.playlist.name)}</h2>
      <div class="success-subtitle">${applePillHtml()} Now in your Apple Music library</div>
    </div>
    <div class="metric-grid success-metrics">
      <div class="metric-card ready"><div class="metric-label">Transferred</div><div class="metric-value">${data.summary.confidentMatchCount}</div></div>
      <div class="metric-card review"><div class="metric-label">Review left</div><div class="metric-value">${data.summary.needsReviewCount}</div></div>
      <div class="metric-card missing"><div class="metric-label">Not moved</div><div class="metric-value">${notTransferred}</div></div>
    </div>
    <div class="receipt-card">
      <div class="receipt-line"><span>Playlist created</span><strong>${esc(destinationName)}</strong></div>
      <div class="receipt-line"><span>Analyzed scope</span><strong>${esc(scope)}</strong></div>
      <div class="receipt-line"><span>Tracks transferred</span><strong>${data.summary.confidentMatchCount}</strong></div>
      <div class="receipt-line"><span>Still needs review</span><strong>${data.summary.needsReviewCount}</strong></div>
      <div class="receipt-line"><span>Missing or skipped</span><strong>${data.summary.unmatchedCount}</strong></div>
      <div class="receipt-line"><span>Destination</span><strong>Apple Music</strong></div>
    </div>
    <div class="trust-note">Only ready tracks from the analyzed report were added. Open Apple Music to see the new playlist in your library.</div>
    <div class="button-row">
      <a class="button-link" href="${esc(appleMusicPlaylistUrl(createdApplePlaylistId))}" target="_blank" rel="noopener noreferrer">
        ${applePillHtml()} Open in Apple Music
      </a>
      <button class="soft-action" type="button" data-start-over="true">Transfer another playlist</button>
    </div>
  `;
}

function errorCopy(error, kind) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("apple music is not connected") || lower.includes("music user token")) {
    return {
      title: "Apple Music needs permission.",
      body: "Nothing was created yet. Connect Apple Music when you are ready to write this playlist into your library.",
      next: "Tap Create again and allow Apple Music access.",
      showFallback: false
    };
  }

  if (lower.includes("developer token")) {
    return {
      title: "Apple Music setup is missing.",
      body: message,
      next: "Refresh the developer token in the Transfer API environment, then restart the API.",
      showFallback: false
    };
  }

  if (lower.includes("spotify") || lower.includes("public") || kind === "preview") {
    return {
      title: "We could not read this Spotify link.",
      body: message,
      next: "Use the fallback guide below, then paste the new Spotify link here.",
      showFallback: true
    };
  }

  return {
    title: "Something interrupted this transfer.",
    body: message,
    next: "Nothing was written unless you saw the transfer-complete receipt. You can safely retry.",
    showFallback: false
  };
}

function renderError(error, kind) {
  const copy = errorCopy(error, kind);
  results.className = "result-empty";
  results.innerHTML = `
    <p class="eyebrow">Needs attention</p>
    <h2>${esc(copy.title)}</h2>
    <p>${esc(copy.body)}</p>
    <p><strong>${esc(copy.next)}</strong></p>
  `;
  fallbackGuide.hidden = !copy.showFallback;
}

async function updateReviewDecision(index, action, candidateIndex = null) {
  if (!state.analysis || !state.transferId) {
    setStatus("Analyze the playlist again before reviewing tracks.", "error");
    clearStoredTransfer();
    return;
  }

  setBusy(true, "Saving review decision...");
  const startedAt = performance.now();

  try {
    const data = await apiFetch(
      `/api/transfers/${encodeURIComponent(state.transferId)}/items/${encodeURIComponent(index)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, candidateIndex })
      }
    );

    adoptAnalysis(data);
    renderAnalysis(data);
    refreshActions();

    if (action === "use-candidate") showToast("Candidate selected.", "success");
    if (action === "approve") showToast("Track approved.", "success");
    if (action === "skip") showToast("Track skipped.", "info");
    setStatus("Review saved. Refreshing now will keep this transfer.");
    trackEvent("review_decision_succeeded", {
      ...summaryProperties(data),
      durationMs: elapsedMs(startedAt),
      reviewAction: action,
      itemIndex: index,
      candidateIndex
    });
  } catch (error) {
    setStatus(errorMessage(error), "error");
    showToast("Review was not saved.", "error");
    trackEvent("review_decision_failed", {
      durationMs: elapsedMs(startedAt),
      errorCategory: "review_decision",
      errorMessage: errorMessage(error),
      reviewAction: action,
      itemIndex: index,
      candidateIndex
    });
  } finally {
    setBusy(false);
  }
}

async function previewPlaylist() {
  const value = input.value.trim();
  if (!value) return;

  fallbackGuide.hidden = true;
  resetProgress();
  setBusy(true, "Reading public Spotify link...");
  const startedAt = performance.now();
  trackEvent("preview_started");

  try {
    const data = await postJson("/api/spotify/public-playlist-preview", { input: value });
    state.preview = data;
    state.previewInput = value;
    state.analysis = null;
    state.analysisInput = null;
    clearStoredTransfer();
    renderPreview(data);
    setStatus("Playlist loaded. Next: analyze Apple Music matches.");
    trackEvent("preview_succeeded", {
      ...summaryProperties(data),
      durationMs: elapsedMs(startedAt)
    });
  } catch (error) {
    state.preview = null;
    state.previewInput = null;
    state.analysis = null;
    state.analysisInput = null;
    clearStoredTransfer();
    setStatus(errorMessage(error), "error");
    renderError(error, "preview");
    trackEvent("preview_failed", {
      durationMs: elapsedMs(startedAt),
      errorCategory: "spotify_public_preview",
      errorMessage: errorMessage(error)
    });
  } finally {
    setBusy(false);
  }
}

async function analyzeMatches() {
  const value = input.value.trim();
  if (!value) return;
  if (!(await ensureDeveloperTokenForAnalysis())) return;

  fallbackGuide.hidden = true;
  setBusy(true, "Matching against Apple Music. Large playlists can take a minute.");
  const startedAt = performance.now();
  trackEvent("analysis_started");

  try {
    const data = await startJob("/api/transfers/analyze-public-job", {
      input: value,
      limit: analysisLimit.value
    });
    adoptAnalysis(data);
    renderAnalysis(data);
    setStatus("Analysis complete and saved. Refreshing now will keep this transfer.");
    trackEvent("analysis_succeeded", {
      ...summaryProperties(data),
      durationMs: elapsedMs(startedAt)
    });
  } catch (error) {
    setStatus(errorMessage(error), "error");
    renderError(error, "analysis");
    trackEvent("analysis_failed", {
      durationMs: elapsedMs(startedAt),
      errorCategory: "apple_music_match",
      errorMessage: errorMessage(error)
    });
  } finally {
    setBusy(false);
  }
}

async function createPlaylist() {
  const value = input.value.trim();
  if (!value || !state.analysis) return;
  const startedAt = performance.now();
  trackEvent("transfer_create_started", {
    ...summaryProperties(state.analysis),
    appleConnected: hasAppleMusicConnection()
  });

  if (!(await ensureAppleMusicForCreate())) {
    setStatus("Apple Music connection skipped. Nothing was created.");
    trackEvent("transfer_create_failed", {
      ...summaryProperties(state.analysis),
      durationMs: elapsedMs(startedAt),
      errorCategory: "apple_music_not_connected",
      errorMessage: "Apple Music connection skipped.",
      appleConnected: false
    });
    return;
  }

  fallbackGuide.hidden = true;
  setBusy(true, "Creating Apple Music playlist from ready tracks...");

  try {
    const data = state.transferId
      ? await startJob(`/api/transfers/${encodeURIComponent(state.transferId)}/create-job`, {})
      : await startJob("/api/transfers/create-public-job", {
          input: value,
          limit: analysisLimit.value,
          analysis: state.analysis
        });

    adoptAnalysis(data);
    renderSuccess(data, data.createdApplePlaylistId);
    setStatus("Transfer complete.");
    showToast("Playlist created.", "success");
    trackEvent("transfer_create_succeeded", {
      ...summaryProperties(data),
      durationMs: elapsedMs(startedAt),
      appleConnected: true
    });
  } catch (error) {
    setStatus(errorMessage(error), "error");
    renderError(error, "create");
    trackEvent("transfer_create_failed", {
      ...summaryProperties(state.analysis),
      durationMs: elapsedMs(startedAt),
      errorCategory: "apple_music_create",
      errorMessage: errorMessage(error),
      appleConnected: hasAppleMusicConnection()
    });
  } finally {
    setBusy(false);
  }
}

async function restoreStoredTransfer() {
  const transferId = readStoredTransferId();
  if (!transferId) return;

  try {
    const data = await apiFetch(`/api/transfers/${encodeURIComponent(transferId)}`);
    adoptAnalysis(data);

    if (data.createdApplePlaylistId) {
      renderSuccess(data, data.createdApplePlaylistId);
      setStatus("Restored your completed transfer receipt.");
    } else {
      renderAnalysis(data);
      setStatus("Restored your last transfer. Review decisions are saved on the server.");
    }
  } catch (error) {
    clearStoredTransfer();
    setStatus("Previous transfer could not be restored. Start a new analysis when ready.");
  } finally {
    refreshActions();
  }
}

function startAnotherTransfer() {
  input.value = "";
  state.preview = null;
  state.previewInput = null;
  state.analysis = null;
  state.analysisInput = null;
  clearStoredTransfer();
  fallbackGuide.hidden = true;
  resetProgress();
  renderStartState();
  setStatus("Paste a playlist link to begin.");
  refreshActions();
  input.focus();
}

async function initialize() {
  renderAppleSession();
  if (readStoredTransferId()) await restoreStoredTransfer();
  refreshActions();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  previewPlaylist();
});

input.addEventListener("input", () => {
  const hasInput = Boolean(input.value.trim());
  state.preview = null;
  state.previewInput = null;
  state.analysis = null;
  state.analysisInput = null;
  clearStoredTransfer();
  fallbackGuide.hidden = true;
  resetProgress();
  renderStartState({ hasInput });
  setStatus(hasInput ? "New link ready. Tap the arrow to preview it." : "Paste a playlist link to begin.");
  refreshActions();
});

previewButton.addEventListener("click", previewPlaylist);
analyzeButton.addEventListener("click", analyzeMatches);
createButton.addEventListener("click", createPlaylist);
connectAppleButton.addEventListener("click", connectAppleMusic);

results.addEventListener("click", async (event) => {
  const startOver = event.target instanceof Element ? event.target.closest("[data-start-over]") : null;
  if (startOver) {
    startAnotherTransfer();
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("[data-review-action]") : null;
  if (!target) return;

  await updateReviewDecision(
    Number(target.dataset.reviewIndex),
    target.dataset.reviewAction,
    target.dataset.candidateIndex == null ? null : Number(target.dataset.candidateIndex)
  );
});

initialize();
