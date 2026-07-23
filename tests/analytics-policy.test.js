import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_EVENT_NAMES,
  SAFE_ANALYTICS_PROPERTY_KEYS
} from "../shared/analytics-policy.js";

test("analytics policy accepts native lifecycle and playlist update events", () => {
  const requiredEvents = [
    "app_opened",
    "app_diagnostics_received",
    "transfer_update_started",
    "transfer_update_succeeded",
    "transfer_update_failed"
  ];

  for (const event of requiredEvents) {
    assert.ok(ANALYTICS_EVENT_NAMES.includes(event), `${event} should be allowlisted`);
  }
});

test("analytics policy accepts manual match quality feedback without free-form queries", () => {
  const requiredEvents = [
    "manual_match_search_started",
    "manual_match_search_succeeded",
    "manual_match_search_failed",
    "match_feedback_selected"
  ];
  const requiredProperties = [
    "spotifyTrackId",
    "spotifyIsrc",
    "algorithmAppleCandidateId",
    "selectedAppleCandidateId",
    "algorithmConfidence",
    "algorithmReason",
    "sourceMatchStatus",
    "selectionSource",
    "selectionChanged",
    "resultRank",
    "resultCount",
    "queryEdited",
    "queryLength"
  ];

  for (const event of requiredEvents) {
    assert.ok(ANALYTICS_EVENT_NAMES.includes(event), `${event} should be allowlisted`);
  }
  for (const property of requiredProperties) {
    assert.ok(SAFE_ANALYTICS_PROPERTY_KEYS.includes(property), `${property} should be allowlisted`);
  }

  assert.ok(!SAFE_ANALYTICS_PROPERTY_KEYS.includes("searchQuery"));
  assert.ok(!SAFE_ANALYTICS_PROPERTY_KEYS.includes("trackName"));
  assert.ok(!SAFE_ANALYTICS_PROPERTY_KEYS.includes("artistName"));
});

test("analytics policy accepts local history usage without storing history contents", () => {
  const requiredEvents = [
    "history_opened",
    "history_retry_started",
    "history_retry_succeeded",
    "history_retry_failed",
    "history_deleted",
    "history_cleared"
  ];

  for (const event of requiredEvents) {
    assert.ok(ANALYTICS_EVENT_NAMES.includes(event), `${event} should be allowlisted`);
  }

  for (const property of ["historyStatus", "historyEntryAgeDays", "historyCount"]) {
    assert.ok(SAFE_ANALYTICS_PROPERTY_KEYS.includes(property), `${property} should be allowlisted`);
  }

  assert.ok(!SAFE_ANALYTICS_PROPERTY_KEYS.includes("historyInput"));
  assert.ok(!SAFE_ANALYTICS_PROPERTY_KEYS.includes("historyPlaylistName"));
});

test("analytics policy accepts only aggregate lifecycle and diagnostics fields", () => {
  const requiredProperties = [
    "appVersion",
    "buildNumber",
    "isFirstLaunch",
    "sourceSurface",
    "diagnosticPayloadCount",
    "crashCount",
    "hangCount",
    "cpuExceptionCount",
    "diskWriteExceptionCount"
  ];

  for (const property of requiredProperties) {
    assert.ok(SAFE_ANALYTICS_PROPERTY_KEYS.includes(property), `${property} should be allowlisted`);
  }

  assert.ok(!SAFE_ANALYTICS_PROPERTY_KEYS.includes("stackTrace"));
  assert.ok(!SAFE_ANALYTICS_PROPERTY_KEYS.includes("appleMusicUserToken"));
  assert.ok(!SAFE_ANALYTICS_PROPERTY_KEYS.includes("email"));
});
