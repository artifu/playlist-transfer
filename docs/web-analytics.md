# Web Analytics Runbook

Last reviewed: 2026-10-17

## Funnel

Google Analytics receives these web funnel events:

| Step | Event | Meaning |
| --- | --- | --- |
| 1 | `landing_cta_clicked` | A visitor moves from an SEO/content page to the transfer tool. |
| 1 | `transfer_form_started` | A visitor pastes or types a Spotify link. |
| 2 | `preview_started` | A visitor explicitly submits the link by clicking Preview or pressing Enter. |
| 2 | `preview_succeeded` / `preview_failed` | Spotify public-link preview outcome. |
| 3 | `analysis_succeeded` / `analysis_failed` | Apple Music match-analysis outcome. |
| 4 | `apple_connect_succeeded` / `apple_connect_failed` | Apple Music authorization outcome. |
| 5 | `transfer_create_started` / `transfer_create_failed` | Playlist-creation attempt and failure. |
| 6 | `transfer_create_succeeded` | Operational completion event. |
| 6 | `playlist_transfer_completed` | Stable GA4 business outcome; configure this as a key event. |

Each GA4 product event includes `funnelStage`, `funnelStep`, and `funnelOutcome` when applicable. Aggregate transfer and match counts are included, but Spotify URLs, transfer IDs, Apple Music tokens, and authorization payloads are excluded.

## GA4 key event

`playlist_transfer_completed` was registered as a code-based key event in the PlaylistXfer GA4 property on 2026-07-17, with no default monetary value and once-per-event counting.

To verify or recreate it:

1. Open **Admin**.
2. Open **Data display > Key events**.
3. Add `playlist_transfer_completed` as a key event.

GA4 can register the key-event name before its first occurrence. Historical events from before it is marked are not retroactively counted as key events.

## GA4 exploration

The PlaylistXfer GA4 property has a saved funnel exploration named `PlaylistXfer web transfer funnel` with the tab `Web funnel`. It uses a 28-day lookback and breaks results down by device category. Its target step configuration is:

1. `page_view`
2. `transfer_form_started`
3. `preview_started`
4. `preview_succeeded`
5. `analysis_succeeded`
6. `apple_connect_succeeded`
7. `playlist_transfer_completed`

On 2026-10-16, the exploration showed 85 visitors, 58 link-entry starts, 27 successful previews, 21 successful analyses, 14 Apple Music connections, and 12 completed transfers. The largest measured drop was link entry to successful preview: 31 users, or 53.45% of link-entry starts. Treat these values as a dated snapshot, not a permanent baseline.

The `preview_started` step was added to the product instrumentation on 2026-10-17 so future reports can separate users who stop after entering a link from attempts that fail technically. Preview failures now send only allowlisted `errorCategory`, `errorCode`, `inputKind`, and `sourceSurface` values. The web client no longer sends playlist IDs or transfer IDs with analytics events. The saved GA4 exploration was updated on 2026-10-20 to include `preview_started` between link entry and preview success while preserving the device-category breakdown.

## Preview baseline and outage correction

Run the privacy-safe web report with:

```bash
npm run analytics:web-preview
```

The 28-day D1 baseline captured on 2026-10-17 contained 180 preview attempts, 54 successes, and 126 failures. This aggregate was dominated by the Spotify-ingestion outage from September 19 through September 30: 117 of the 126 failures occurred during that interval.

From October 4 through October 17, the service recorded 63 attempts, 54 successes, and 9 failures, an 85.7% technical preview success rate. Therefore the earlier GA4 link-entry-to-preview figure mixed a historical outage with current user behavior and must not be treated as evidence for a broad landing-page redesign.

## Durable first-party events

Cloudflare-native production stores allowlisted operational events in the D1 `analytics_events` table for 90 days. The anonymous browser/app session is one-way hashed. This layer remains available when GA is blocked and is the source for exact operational funnel counts.

Example read-only D1 queries:

```sql
select
  event,
  count(*) as events,
  count(distinct anonymous_session) as sessions
from analytics_events
where observed_at >= datetime('now', '-28 days')
group by event
order by events desc;
```

```sql
select
  substr(observed_at, 1, 10) as day,
  count(*) as completed_transfers
from analytics_events
where event = 'transfer_create_succeeded'
  and observed_at >= datetime('now', '-90 days')
group by day
order by day desc;
```

The `transfers` table is the authoritative cross-check for successful playlist creation while transfer records remain inside their shorter operational retention window:

```sql
select
  count(*) as analyzed_transfers,
  sum(case when created_apple_playlist_id is not null then 1 else 0 end) as completed_transfers
from transfers;
```

## iOS operational report

The native app uses the same durable first-party event route and identifies its events with `host = ios`. It records lifecycle, input source, the transfer funnel, playlist updates, review decisions, and aggregate MetricKit diagnostic counts. MetricKit stack traces and raw diagnostic payloads are not uploaded.

Run the read-only production report:

```bash
npm run analytics:report
```

The report in `tools/analytics-report.sql` includes:

- 28-day event counts and anonymous-device counts
- daily active iOS devices and completed transfers
- manual, clipboard-button, and Share Sheet input sources
- average match rate and analysis duration
- failure categories and affected devices
- day-1 and day-7 anonymous-device return counts
- 90-day crash, hang, CPU-exception, and disk-write-exception totals
- manual-match search adoption and exact correction choices
- aggregate duplicate-prevention actions by Inbox, new playlist, and existing playlist

Manual-match quality feedback records the Spotify track/ISRC identifier, the Apple
catalog identifier suggested by the algorithm, the identifier ultimately chosen,
the algorithm confidence/reason, and the selected result rank. This is enough to
reconstruct and improve a bad match using public catalog metadata. Free-form
search queries and song/artist names are deliberately excluded from analytics.

The lifecycle identifier remains the existing one-way-hashed anonymous app session stored in `UserDefaults`. It is not an advertising identifier and is not joined to third-party data.
