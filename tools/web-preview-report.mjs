import { spawnSync } from "node:child_process";

const queries = [
  `select
    'web_preview_funnel_28d' as report,
    event,
    count(*) as events,
    count(distinct anonymous_session) as anonymous_devices
  from analytics_events
  where observed_at >= datetime('now', '-28 days')
    and json_extract(properties_json, '$.host') = 'playlistxfer.com'
    and event in ('transfer_form_started', 'preview_started', 'preview_succeeded', 'preview_failed')
  group by event
  order by event;`,
  `select
    'web_preview_failures_28d' as report,
    coalesce(json_extract(properties_json, '$.errorCategory'), 'uncategorized') as error_category,
    coalesce(json_extract(properties_json, '$.errorCode'), 'legacy_unspecified') as error_code,
    count(*) as failures,
    count(distinct anonymous_session) as anonymous_devices
  from analytics_events
  where observed_at >= datetime('now', '-28 days')
    and json_extract(properties_json, '$.host') = 'playlistxfer.com'
    and event = 'preview_failed'
  group by error_category, error_code
  order by failures desc;`,
  `select
    'web_preview_daily_28d' as report,
    substr(observed_at, 1, 10) as day,
    sum(case when event = 'preview_started' then 1 else 0 end) as started,
    sum(case when event = 'preview_succeeded' then 1 else 0 end) as succeeded,
    sum(case when event = 'preview_failed' then 1 else 0 end) as failed,
    count(distinct anonymous_session) as anonymous_devices
  from analytics_events
  where observed_at >= datetime('now', '-28 days')
    and json_extract(properties_json, '$.host') = 'playlistxfer.com'
    and event in ('preview_started', 'preview_succeeded', 'preview_failed')
  group by day
  order by day desc;`
];

for (const query of queries) {
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "playlist-transfer", "--remote", "--command", query],
    { stdio: "inherit" }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
