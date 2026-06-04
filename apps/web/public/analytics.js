(function () {
  const config = window.PLAYLIST_XFER_CONFIG || {};
  const measurementId = typeof config.gaMeasurementId === "string" ? config.gaMeasurementId.trim() : "";

  function safeProperties(properties) {
    const allowed = new Set([
      "analysisLimit",
      "appleConnected",
      "durationMs",
      "errorCategory",
      "hasDeveloperToken",
      "matchRate",
      "missingCount",
      "playlistSource",
      "readableTracks",
      "readyCount",
      "reviewAction",
      "reviewCount",
      "totalTracks",
      "withIsrcCount"
    ]);

    return Object.fromEntries(
      Object.entries(properties || {})
        .filter(([key]) => allowed.has(key))
        .map(([key, value]) => [key, value])
        .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    );
  }

  function setupGoogleAnalytics() {
    if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };

    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      page_title: document.title,
      page_location: window.location.href
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.append(script);
  }

  window.PlaylistXferAnalytics = {
    isEnabled: Boolean(measurementId),
    track(eventName, properties) {
      if (!window.gtag || !eventName) return;

      window.gtag("event", String(eventName).slice(0, 40), {
        event_category: "playlist_transfer",
        ...safeProperties(properties)
      });
    }
  };

  setupGoogleAnalytics();
})();
