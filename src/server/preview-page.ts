export function renderPreviewPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PlaylistTransfer Spotify Preview</title>
    <style>
      :root {
        color-scheme: light;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f4f6f3;
        color: #171917;
      }

      body {
        margin: 0;
      }

      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }

      header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        border-bottom: 1px solid #d8ddd3;
        padding-bottom: 20px;
      }

      h1 {
        margin: 0;
        font-size: clamp(28px, 5vw, 52px);
        line-height: 1;
      }

      .summary {
        color: #596156;
        margin: 10px 0 0;
        max-width: 640px;
        line-height: 1.5;
      }

      form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        margin: 26px 0;
      }

      input {
        min-width: 0;
        border: 1px solid #c7cec2;
        border-radius: 8px;
        padding: 13px 14px;
        font: inherit;
        background: #fff;
      }

      button {
        border: 0;
        border-radius: 8px;
        padding: 0 18px;
        min-height: 48px;
        background: #172019;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      }

      button:disabled {
        opacity: 0.65;
        cursor: wait;
      }

      .status {
        min-height: 24px;
        color: #596156;
        font-weight: 650;
      }

      .playlist {
        display: grid;
        gap: 4px;
        margin-top: 24px;
      }

      .playlist h2 {
        margin: 0;
        font-size: 28px;
      }

      .meta {
        color: #596156;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 18px;
        background: #fff;
        border: 1px solid #d8ddd3;
      }

      th,
      td {
        padding: 11px 12px;
        border-bottom: 1px solid #e4e8df;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #eef2ea;
        color: #3e463b;
        font-size: 13px;
        text-transform: uppercase;
      }

      td {
        font-size: 14px;
      }

      .track {
        font-weight: 750;
      }

      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
        color: #596156;
      }

      .error {
        color: #9b1c1c;
      }

      @media (max-width: 700px) {
        header,
        form {
          display: grid;
        }

        button {
          width: 100%;
        }

        table {
          display: block;
          overflow-x: auto;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Spotify Playlist Preview</h1>
          <p class="summary">Paste a Spotify playlist link to see what the authenticated account can read from the Web API.</p>
        </div>
      </header>

      <form id="form">
        <input id="playlist-input" autocomplete="off" placeholder="https://open.spotify.com/playlist/..." />
        <button id="submit" type="submit">Preview</button>
      </form>

      <div id="status" class="status"></div>
      <section id="result"></section>
    </main>

    <script>
      const form = document.querySelector("#form");
      const input = document.querySelector("#playlist-input");
      const status = document.querySelector("#status");
      const result = document.querySelector("#result");
      const button = document.querySelector("#submit");

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function formatDuration(ms) {
        if (!ms) return "";
        const totalSeconds = Math.round(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = String(totalSeconds % 60).padStart(2, "0");
        return minutes + ":" + seconds;
      }

      function render(data) {
        const rows = data.tracks.map((track, index) => {
          return "<tr>" +
            "<td>" + (index + 1) + "</td>" +
            "<td><div class='track'>" + escapeHtml(track.name) + "</div><div>" + escapeHtml(track.artists.join(", ")) + "</div></td>" +
            "<td>" + escapeHtml(track.album) + "</td>" +
            "<td>" + formatDuration(track.durationMs) + "</td>" +
            "<td class='mono'>" + escapeHtml(track.isrc || "") + "</td>" +
          "</tr>";
        }).join("");

        result.innerHTML = "<div class='playlist'>" +
          "<h2>" + escapeHtml(data.playlist.name) + "</h2>" +
          "<div class='meta'>" + data.tracks.length + " readable tracks · Spotify ID " + escapeHtml(data.playlist.id) + "</div>" +
          "<table><thead><tr><th>#</th><th>Song</th><th>Album</th><th>Time</th><th>ISRC</th></tr></thead><tbody>" + rows + "</tbody></table>" +
        "</div>";
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) return;

        button.disabled = true;
        status.className = "status";
        status.textContent = "Reading playlist...";
        result.innerHTML = "";

        try {
          const response = await fetch("/api/spotify/playlist-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: value })
          });
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Playlist preview failed.");
          }

          status.textContent = "Playlist loaded.";
          render(data);
        } catch (error) {
          status.className = "status error";
          status.textContent = error instanceof Error ? error.message : String(error);
        } finally {
          button.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}
