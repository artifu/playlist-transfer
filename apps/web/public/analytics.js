(function () {
  const config = window.PLAYLIST_XFER_CONFIG || {};
  const measurementId = typeof config.gaMeasurementId === "string" ? config.gaMeasurementId.trim() : "";

  const funnelEvents = {
    landing_cta_clicked: { funnelStage: "intent", funnelStep: 1, funnelOutcome: "started" },
    transfer_form_started: { funnelStage: "intent", funnelStep: 1, funnelOutcome: "started" },
    preview_started: { funnelStage: "preview", funnelStep: 2, funnelOutcome: "started" },
    preview_succeeded: { funnelStage: "preview", funnelStep: 2, funnelOutcome: "succeeded" },
    preview_failed: { funnelStage: "preview", funnelStep: 2, funnelOutcome: "failed" },
    analysis_started: { funnelStage: "analysis", funnelStep: 3, funnelOutcome: "started" },
    analysis_succeeded: { funnelStage: "analysis", funnelStep: 3, funnelOutcome: "succeeded" },
    analysis_failed: { funnelStage: "analysis", funnelStep: 3, funnelOutcome: "failed" },
    apple_connect_started: { funnelStage: "apple_connect", funnelStep: 4, funnelOutcome: "started" },
    apple_connect_succeeded: { funnelStage: "apple_connect", funnelStep: 4, funnelOutcome: "succeeded" },
    apple_connect_failed: { funnelStage: "apple_connect", funnelStep: 4, funnelOutcome: "failed" },
    transfer_create_started: { funnelStage: "create", funnelStep: 5, funnelOutcome: "started" },
    transfer_create_succeeded: { funnelStage: "complete", funnelStep: 6, funnelOutcome: "succeeded" },
    transfer_create_failed: { funnelStage: "create", funnelStep: 5, funnelOutcome: "failed" }
  };

  function safeProperties(properties) {
    const allowed = new Set([
      "analysisLimit",
      "appleConnected",
      "durationMs",
      "errorCategory",
      "funnelOutcome",
      "funnelStage",
      "funnelStep",
      "guideSection",
      "hasDeveloperToken",
      "matchRate",
      "missingCount",
      "playlistSource",
      "readableTracks",
      "readyCount",
      "reviewAction",
      "reviewCount",
      "sourceSurface",
      "totalTracks",
      "troubleshootingPath",
      "evidenceType",
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

  function setupCtaTracking() {
    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element
        ? event.target.closest("[data-analytics-cta]")
        : null;
      if (!link) return;

      window.PlaylistXferAnalytics?.track?.("landing_cta_clicked", {
        sourceSurface: link.dataset.analyticsCta || "content_page"
      });
    });
  }

  function setupGuideTracking() {
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;

      const sectionLink = event.target.closest("[data-guide-section]");
      if (sectionLink) {
        window.PlaylistXferAnalytics?.track?.("guide_section_selected", {
          guideSection: sectionLink.dataset.guideSection || "unknown"
        });
      }

      const troubleshootingLink = event.target.closest("[data-troubleshooting-path]");
      if (troubleshootingLink) {
        window.PlaylistXferAnalytics?.track?.("guide_troubleshooting_selected", {
          troubleshootingPath: troubleshootingLink.dataset.troubleshootingPath || "unknown"
        });
      }

      const supportLink = event.target.closest("[data-analytics-support]");
      if (supportLink) {
        window.PlaylistXferAnalytics?.track?.("guide_support_clicked", {
          sourceSurface: supportLink.dataset.analyticsSupport || "guide"
        });
      }

      const evidenceLink = event.target.closest("[data-analytics-evidence]");
      if (evidenceLink) {
        window.PlaylistXferAnalytics?.track?.("guide_evidence_clicked", {
          evidenceType: evidenceLink.dataset.analyticsEvidence || "unknown"
        });
      }
    });
  }

  window.PlaylistXferAnalytics = {
    isEnabled: Boolean(measurementId),
    track(eventName, properties) {
      if (!window.gtag || !eventName) return;

      const normalizedEventName = String(eventName).slice(0, 40);
      const eventProperties = {
        event_category: "playlist_transfer",
        ...funnelEvents[normalizedEventName],
        ...safeProperties(properties)
      };

      window.gtag("event", normalizedEventName, eventProperties);

      // Keep the operational event name while giving GA4 one stable business
      // outcome that can be marked as a key event in the property settings.
      if (normalizedEventName === "transfer_create_succeeded") {
        window.gtag("event", "playlist_transfer_completed", eventProperties);
      }
    }
  };

  setupGoogleAnalytics();
  setupCtaTracking();
  setupGuideTracking();
})();
