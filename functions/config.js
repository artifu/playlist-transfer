function jsResponse(source, cacheControl = "no-store") {
  return new Response(source, {
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "text/javascript; charset=utf-8"
    }
  });
}

function safeGoogleAnalyticsId(value) {
  const id = String(value || "").trim();
  return /^G-[A-Z0-9]+$/.test(id) ? id : "";
}

export function onRequest(context) {
  const config = {
    gaMeasurementId: safeGoogleAnalyticsId(context.env.GA_MEASUREMENT_ID)
  };

  return jsResponse(`window.PLAYLIST_XFER_CONFIG = ${JSON.stringify(config)};\n`);
}
