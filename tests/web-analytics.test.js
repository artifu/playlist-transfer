import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function analyticsWindow() {
  const source = await readFile(new URL("../apps/web/public/analytics.js", import.meta.url), "utf8");
  const appendedScripts = [];
  const listeners = new Map();
  const window = {
    PLAYLIST_XFER_CONFIG: { gaMeasurementId: "G-TEST12345" },
    location: { href: "https://playlistxfer.com/" }
  };
  const document = {
    title: "PlaylistXfer",
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    createElement() {
      return {};
    },
    head: {
      append(script) {
        appendedScripts.push(script);
      }
    }
  };

  vm.runInNewContext(source, { document, Element: class Element {}, window });
  return { appendedScripts, listeners, window };
}

test("GA analytics emits funnel metadata and a dedicated completion event", async () => {
  const { appendedScripts, window } = await analyticsWindow();

  window.PlaylistXferAnalytics.track("transfer_create_succeeded", {
    readyCount: 12,
    transferId: "must-not-reach-ga"
  });

  assert.equal(appendedScripts.length, 1);
  const eventCalls = window.dataLayer.filter((entry) => entry[0] === "event");
  assert.equal(eventCalls.length, 2);
  assert.equal(eventCalls[0][1], "transfer_create_succeeded");
  assert.equal(eventCalls[1][1], "playlist_transfer_completed");
  assert.equal(eventCalls[1][2].funnelStage, "complete");
  assert.equal(eventCalls[1][2].funnelStep, 6);
  assert.equal(eventCalls[1][2].readyCount, 12);
  assert.equal(eventCalls[1][2].transferId, undefined);
});

test("GA analytics records intent without leaking unapproved properties", async () => {
  const { window } = await analyticsWindow();

  window.PlaylistXferAnalytics.track("transfer_form_started", {
    sourceSurface: "paste",
    playlistId: "must-not-reach-ga"
  });

  const eventCall = window.dataLayer.find((entry) => entry[0] === "event");
  assert.equal(eventCall[1], "transfer_form_started");
  assert.equal(eventCall[2].funnelStage, "intent");
  assert.equal(eventCall[2].sourceSurface, "paste");
  assert.equal(eventCall[2].playlistId, undefined);
});
