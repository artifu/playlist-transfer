# Web Preview Conversion Roadmap

Last reviewed: 2026-10-17

Status: ready to execute when coding credits are available.

## Objective

Diagnose and reduce the largest measured web-funnel loss without redesigning the landing page or weakening the existing transfer flow.

The current evidence points to the transition between entering a Spotify link and receiving a successful preview. The first job is to split that transition into user abandonment, client-side validation, and backend failure. Product changes follow only where the evidence supports them.

## Baseline

GA4 snapshot captured on 2026-10-16 for the preceding 28 days:

| Step | Active users | Percent of visits |
| --- | ---: | ---: |
| Visit | 85 | 100.0% |
| Link entered | 58 | 68.2% |
| Preview succeeded | 27 | 31.8% |
| Matches analyzed | 21 | 24.7% |
| Apple Music connected | 14 | 16.5% |
| Transfer completed | 12 | 14.1% |

Known observations:

- Link entered to preview succeeded lost 31 users, or 53.45% of link-entry starts.
- Mobile completed 11 of 60 visits, or 18.3%.
- Desktop completed 1 of 25 visits, or 4.0%.
- Desktop lost 70% between link entry and preview success, but the current funnel cannot distinguish no click from a failed request.
- This is a small sample. Do not treat one 28-day window as proof that a visual redesign is needed.

## Guardrails

- Do not redesign the landing page, navigation, typography, branding, or overall information architecture.
- Do not add ads near the input, authorization, progress, review, or error states.
- Do not move Apple Music authorization earlier.
- Do not introduce automatic submission merely because a user pasted text. Keep the preview action explicit.
- Do not record full Spotify URLs, playlist names, track names, tokens, transfer IDs, session hashes, search text, or personal information.
- Preserve the existing primary/fallback Spotify ingestion behavior.
- Preserve unrelated local changes and untracked files.
- Do not declare a conversion win before the observation threshold in Phase 5.

## Phase 1: establish the real funnel

### 1.1 Correct the GA4 exploration

Update the saved `PlaylistXfer web transfer funnel` exploration so it contains these steps in order:

1. `page_view`
2. `transfer_form_started`
3. `preview_started`
4. `preview_succeeded`
5. `analysis_succeeded`
6. `apple_connect_succeeded`
7. `playlist_transfer_completed`

Keep the device-category breakdown. This separates input-to-attempt abandonment from attempted-preview technical failure.

### 1.2 Verify existing event semantics

Confirm in code and tests that:

- `transfer_form_started` fires once when a non-empty value first appears.
- `preview_started` fires once for every explicit click or Enter submission, before validation or networking.
- `preview_succeeded` fires only after a valid playlist or track preview is rendered.
- `preview_failed` fires for client validation and backend failures with sanitized categorical properties.
- Repeated attempts can be measured without duplicating one attempt's events.

Prefer the existing event names. Do not add new analytics events unless the current names cannot answer the questions above.

### 1.3 Add safe failure categories

Use a small allowlisted taxonomy, for example:

- `empty_input`
- `unsupported_spotify_input`
- `private_or_unavailable`
- `spotify_redirect_failed`
- `spotify_upstream`
- `primary_timeout`
- `fallback_timeout`
- `incomplete_preview`
- `network`
- `unknown`

Use stable sanitized codes rather than raw exception text wherever possible. If new property keys are required, add them to both the web analytics allowlist and `shared/analytics-policy.js`, with policy tests proving that URLs, tokens, names, and identifiers remain excluded.

### 1.4 Read the first-party baseline

Run read-only D1 queries for the previous 28 days. Report only aggregate counts and affected anonymous devices.

```sql
select
  event,
  count(*) as events,
  count(distinct anonymous_session) as anonymous_devices
from analytics_events
where observed_at >= datetime('now', '-28 days')
  and json_extract(properties_json, '$.host') = 'playlistxfer.com'
  and event in (
    'transfer_form_started',
    'preview_started',
    'preview_succeeded',
    'preview_failed'
  )
group by event
order by event;
```

```sql
select
  coalesce(json_extract(properties_json, '$.errorCategory'), 'uncategorized') as error_category,
  coalesce(json_extract(properties_json, '$.errorMessage'), 'unspecified') as sanitized_error,
  count(*) as failures,
  count(distinct anonymous_session) as anonymous_devices
from analytics_events
where observed_at >= datetime('now', '-28 days')
  and json_extract(properties_json, '$.host') = 'playlistxfer.com'
  and event = 'preview_failed'
group by error_category, sanitized_error
order by failures desc;
```

Do not print session hashes or inspect individual users.

## Phase 2: harden the Spotify input

Implement only after Phase 1 confirms the measurement path.

### 2.1 Make browser behavior match backend capability

The backend already accepts normal Spotify playlist/track URLs, Spotify URIs, `spotify.link` redirects, and links embedded in share text. The web input currently uses `type="url"`, which can cause browser-native form validation to block Enter submissions for otherwise supported share text.

- Change the field to a text-compatible input while retaining `inputmode="url"` and appropriate autocomplete behavior.
- Normalize invisible characters, surrounding punctuation, share text, and tracking parameters before preview.
- Reuse the semantics in `functions/_lib/spotify-url.js`; avoid maintaining a contradictory parser.
- Accept playlist and individual-track links.
- Keep shortened Spotify redirects supported.
- Reject non-Spotify inputs before the network request with a clear inline message.

### 2.2 Make the action unambiguous

- Use one explicit preview action for click and Enter.
- Use the label `Preview in Apple Music` when it fits without clipping; otherwise retain the compact visible label `Preview` and provide the full accessible name.
- Disable the action only for an empty value or while an attempt is already running.
- Preserve the user's input after a failure.
- Show an in-place loading state that prevents duplicate submissions.
- Put the specific recovery instruction next to the input instead of replacing the entire result area with generic copy.

### 2.3 Map errors to useful messages

At minimum, distinguish:

- not a Spotify playlist or song link;
- private, removed, or unavailable Spotify content;
- shortened link that could not be resolved;
- temporary Spotify/ingestion outage with fallback exhausted;
- preview returned no readable music tracks;
- unexpected failure with a retry action.

Never expose infrastructure names, stack traces, internal endpoints, or raw upstream responses in product copy.

## Phase 3: test desktop and mobile paths

Add automated coverage for both clicking and pressing Enter with:

- a normal playlist URL;
- an individual-track URL;
- a URL with query parameters;
- a full sentence copied from Spotify Share containing a URL;
- a `spotify.link` URL;
- invisible characters and surrounding punctuation;
- a private/unavailable URL response;
- malformed and non-Spotify input;
- primary ingestion failure with successful fallback;
- primary and fallback failure;
- repeated retry after an error.

Verify visually at minimum at 390x844 and 1440x900:

- input text and preview CTA never overlap or clip;
- Enter and click use the same submission path;
- errors remain adjacent to the input;
- loading and retry states do not shift or break the layout;
- the App Store link and secondary content remain below the primary transfer action on mobile.

Required local gates:

```bash
npm test
npm run check
npm run build
git diff --check
```

## Phase 4: deploy and verify production

After all gates pass:

1. Commit only files related to this roadmap.
2. Push the implementation to the normal production branch.
3. Verify `GET https://playlistxfer.com/health` is healthy and both primary and fallback ingestion dependencies are available.
4. Run the production synthetic preview with the known public test playlist; do not print or retain the URL or track data.
5. Exercise click and Enter on desktop and mobile production.
6. Confirm GA4 receives `transfer_form_started`, `preview_started`, and exactly one terminal preview outcome for the attempt.
7. Confirm D1 stores the allowlisted aggregate event without URLs or personal information.
8. Update `docs/web-analytics.md` with the final event semantics and deployment date.

Rollback immediately if preview success, analysis, Apple authorization, or completed transfers regress, or if sensitive input appears in analytics.

## Phase 5: observe before further redesign

Observe for at least 14 days or 100 `preview_started` attempts, whichever takes longer.

Track these ratios overall and by device category:

- intent rate: `transfer_form_started / page_view`;
- attempt rate: `preview_started / transfer_form_started`;
- technical preview success: `preview_succeeded / preview_started`;
- completion from preview: `playlist_transfer_completed / preview_succeeded`;
- visit-to-transfer conversion: `playlist_transfer_completed / page_view`.

Initial decision rules:

- If attempt rate is low but technical success is high, improve CTA clarity and adjacent guidance.
- If attempt rate is high but technical success is low, prioritize validation and ingestion reliability.
- If desktop remains materially worse after bot/internal traffic is excluded, inspect the desktop interaction and traffic mix before changing the whole page.
- If preview succeeds but analysis drops, start a separate analysis-stage roadmap rather than expanding this one.

The directional target is to improve link-entry-to-preview success from 46.55% to at least 60% without reducing downstream preview-to-transfer conversion. Treat this as a product target, not a statistically proven forecast.

## Definition of done

- The GA4 funnel includes `preview_started` and can distinguish abandonment from failure.
- D1 provides aggregate failure categories without sensitive data.
- All supported Spotify input formats behave consistently for click and Enter.
- User-facing errors are specific and recoverable.
- Desktop and mobile regression tests cover the critical preview paths.
- Production synthetic checks pass after deployment.
- The 14-day/100-attempt observation is documented before any broader landing-page redesign.

## Ready-to-run trigger prompt

Use this prompt in a future Codex task:

> Execute `docs/web-preview-conversion-roadmap.md` end to end. Start by reading the repository instructions and current implementation. Complete Phases 1 through 4, including the read-only D1 baseline, analytics corrections, input hardening, automated tests, responsive visual QA, production deployment, and production verification. Do not redesign the landing page, add ads near the transfer flow, move Apple Music authorization earlier, or log sensitive data. Reuse existing Spotify parsing and analytics infrastructure where possible. Preserve all unrelated working-tree changes and untracked files. Run every required gate, commit only your scoped changes, push/deploy only after the gates pass, and report the baseline, exact changes, test results, production health, commit, and any blocker. Leave Phase 5 as an observation period and document its start date and baseline after deployment.
