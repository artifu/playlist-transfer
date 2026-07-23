-- PlaylistXfer operational analytics report.
-- Run with: npm run analytics:report

select
  'event_funnel_28d' as report,
  event,
  count(*) as events,
  count(distinct anonymous_session) as anonymous_devices
from analytics_events
where observed_at >= datetime('now', '-28 days')
group by event
order by events desc;

select
  'ios_daily_28d' as report,
  substr(observed_at, 1, 10) as day,
  count(distinct anonymous_session) as active_devices,
  sum(case when event = 'preview_succeeded' then 1 else 0 end) as previews,
  sum(case when event = 'analysis_succeeded' then 1 else 0 end) as analyses,
  sum(case when event = 'transfer_create_succeeded' then 1 else 0 end) as completed_transfers,
  sum(case when event in ('preview_failed', 'analysis_failed', 'transfer_create_failed', 'transfer_update_failed') then 1 else 0 end) as failures
from analytics_events
where observed_at >= datetime('now', '-28 days')
  and json_extract(properties_json, '$.host') = 'ios'
group by day
order by day desc;

select
  'ios_source_surface_28d' as report,
  coalesce(json_extract(properties_json, '$.sourceSurface'), 'unknown') as source_surface,
  count(*) as preview_attempts,
  count(distinct anonymous_session) as anonymous_devices
from analytics_events
where observed_at >= datetime('now', '-28 days')
  and event = 'preview_started'
  and json_extract(properties_json, '$.host') = 'ios'
group by source_surface
order by preview_attempts desc;

select
  'ios_match_quality_28d' as report,
  round(avg(cast(json_extract(properties_json, '$.matchRate') as real)), 3) as average_match_rate,
  round(avg(cast(json_extract(properties_json, '$.durationMs') as real))) as average_analysis_ms,
  sum(cast(json_extract(properties_json, '$.readyCount') as integer)) as ready_tracks,
  sum(cast(json_extract(properties_json, '$.reviewCount') as integer)) as review_tracks,
  sum(cast(json_extract(properties_json, '$.missingCount') as integer)) as missing_tracks
from analytics_events
where observed_at >= datetime('now', '-28 days')
  and event = 'analysis_succeeded'
  and json_extract(properties_json, '$.host') = 'ios';

select
  'ios_errors_28d' as report,
  event,
  coalesce(json_extract(properties_json, '$.errorCategory'), 'unknown') as error_category,
  count(*) as failures,
  count(distinct anonymous_session) as affected_devices
from analytics_events
where observed_at >= datetime('now', '-28 days')
  and event in ('preview_failed', 'analysis_failed', 'transfer_create_failed', 'transfer_update_failed')
  and json_extract(properties_json, '$.host') = 'ios'
group by event, error_category
order by failures desc;

with ios_opens as (
  select
    anonymous_session,
    date(observed_at) as open_day
  from analytics_events
  where event = 'app_opened'
    and anonymous_session is not null
    and json_extract(properties_json, '$.host') = 'ios'
),
first_open as (
  select anonymous_session, min(open_day) as first_day
  from ios_opens
  group by anonymous_session
)
select
  'ios_retention_28d' as report,
  first_open.first_day,
  count(distinct first_open.anonymous_session) as new_devices,
  count(distinct case
    when julianday(ios_opens.open_day) - julianday(first_open.first_day) >= 1
    then first_open.anonymous_session
  end) as returned_after_day_1,
  count(distinct case
    when julianday(ios_opens.open_day) - julianday(first_open.first_day) >= 7
    then first_open.anonymous_session
  end) as returned_after_day_7
from first_open
left join ios_opens on ios_opens.anonymous_session = first_open.anonymous_session
where first_open.first_day >= date('now', '-28 days')
group by first_open.first_day
order by first_open.first_day desc;

select
  'ios_diagnostics_90d' as report,
  sum(cast(json_extract(properties_json, '$.crashCount') as integer)) as crashes,
  sum(cast(json_extract(properties_json, '$.hangCount') as integer)) as hangs,
  sum(cast(json_extract(properties_json, '$.cpuExceptionCount') as integer)) as cpu_exceptions,
  sum(cast(json_extract(properties_json, '$.diskWriteExceptionCount') as integer)) as disk_write_exceptions
from analytics_events
where observed_at >= datetime('now', '-90 days')
  and event = 'app_diagnostics_received'
  and json_extract(properties_json, '$.host') = 'ios';

select
  'ios_manual_match_usage_28d' as report,
  count(case when event = 'manual_match_search_started' then 1 end) as searches,
  count(case when event = 'match_feedback_selected'
    and json_extract(properties_json, '$.selectionSource') = 'manual_search'
    then 1 end) as manual_selections,
  count(distinct case when event = 'manual_match_search_started' then anonymous_session end) as searching_devices,
  round(
    100.0 * count(distinct case when event = 'manual_match_search_started' then anonymous_session end)
    / nullif(count(distinct case when event = 'analysis_succeeded' then anonymous_session end), 0),
    1
  ) as percent_of_analyzing_devices_using_search
from analytics_events
where observed_at >= datetime('now', '-28 days')
  and json_extract(properties_json, '$.host') = 'ios';

select
  'ios_match_feedback_90d' as report,
  observed_at,
  json_extract(properties_json, '$.spotifyTrackId') as spotify_track_id,
  json_extract(properties_json, '$.spotifyIsrc') as spotify_isrc,
  json_extract(properties_json, '$.algorithmAppleCandidateId') as algorithm_apple_candidate_id,
  json_extract(properties_json, '$.selectedAppleCandidateId') as selected_apple_candidate_id,
  json_extract(properties_json, '$.algorithmConfidence') as algorithm_confidence,
  json_extract(properties_json, '$.algorithmReason') as algorithm_reason,
  json_extract(properties_json, '$.sourceMatchStatus') as source_match_status,
  json_extract(properties_json, '$.selectionSource') as selection_source,
  json_extract(properties_json, '$.resultRank') as selected_result_rank
from analytics_events
where observed_at >= datetime('now', '-90 days')
  and event = 'match_feedback_selected'
  and json_extract(properties_json, '$.selectionChanged') = 1
order by observed_at desc;

select
  'ios_local_history_usage_28d' as report,
  event,
  count(*) as events,
  count(distinct anonymous_session) as anonymous_devices
from analytics_events
where observed_at >= datetime('now', '-28 days')
  and event in (
    'history_opened',
    'history_retry_started',
    'history_retry_succeeded',
    'history_retry_failed',
    'history_deleted',
    'history_cleared'
  )
  and json_extract(properties_json, '$.host') = 'ios'
group by event
order by events desc;
