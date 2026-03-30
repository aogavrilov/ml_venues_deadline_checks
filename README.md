# A* Conference Deadline Monitor

Codebase for tracking AI conference deadlines across canonical sources, with the
first end-to-end ingestion slice now wired into public views and deployable as a
static GitHub Pages site.

## Stack

- Next.js App Router for the public deadline UI shell
- Prisma ORM with SQLite for local development and the first migration flow
- `worker/registry.ts` for registry snapshot bootstrapping
- `worker/fetch-source-snapshot.cjs` for real source fetches
- `worker/ingest-deadlines.cjs` plus `worker/conference-dates-parser.cjs` for canonical deadline normalization
- JSON source registry under `data/sources/registry.json`
- JSON ingestion config under `data/overrides/manual-deadlines.json`

## Canonical data model

The first milestone defines these core entities:

- `Venue`: conference series metadata and default timezone
- `Edition`: yearly instance of a venue
- `Track`: named submission tracks for each venue
- `Deadline`: specific submission cutoffs linked to venue, edition, and optional track
- `Source`: canonical and supporting upstream pages for deadline extraction
- `SourceSnapshot`: fetched or synthesized source payloads used for traceable extraction

## Local setup

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm db:generate`.
4. Apply the local migration with `pnpm db:migrate`.
5. Seed the registry with `pnpm db:seed`.
6. Fetch the first official snapshot with `pnpm worker:fetch -- iclr official-dates`.
7. Normalize canonical deadlines with `pnpm worker:ingest -- iclr 2026`.
8. Start the app with `pnpm dev`.

Useful commands:

- `pnpm worker:registry` writes registry-backed snapshots into `data/snapshots/registry/`
- `pnpm worker:fetch -- iclr official-dates` stores raw fetched HTML into `data/snapshots/fetched/`
- `pnpm worker:ingest -- iclr 2026` writes normalized deadline rows with provenance
- `pnpm build` verifies the app build
- `pnpm typecheck` runs TypeScript only

## Deployment

The repo ships with a GitHub Pages workflow in `.github/workflows/deploy.yml`.
Push to `main` and GitHub Actions will publish the static export from `out/`.

- Published URL pattern: `https://<github-user>.github.io/<repo-name>/`
- Health page: `/health/`
- The deployed site uses the committed `prisma/dev.db`, so Pages builds from a
  deterministic dataset without external infrastructure.

## Registry scope

The current tracked venue set covers:

- NeurIPS
- ICML
- ICLR
- CVPR
- ACL
- EMNLP
- AISTATS
- CoRL
- KDD
- NAACL
- COLM
- ECCV
- ICCV
- SIGIR
- WWW

This is intentionally broad enough to cover the first two Phase 1 expansion waves
without overfitting the schema to one venue family.

## Parser coverage

The current production parser set covers five source shapes:

- the shared conference `.../Dates` page template used by ICLR, NeurIPS, ICML, and CVPR
- homepage `Important Dates` tables for ACL 2026 and EMNLP 2025
- AISTATS 2026's official dates page
- KDD 2026's research-track CFP dates block
- The Web Conference 2026 research-track important-dates page
- NAACL 2025's ARR-based main-conference call page
- COLM 2026's key-dates page
- ECCV 2026 and ICCV 2025 through the shared ECVA/CVF dates-table structure plus milestone aliases

Across those sources it normalizes the canonical milestones each page exposes, including:

- Abstract submission deadline
- Paper submission deadline
- Reviews released
- Author response deadline
- Decision notification
- Supplementary materials deadline when the venue publishes it

`data/overrides/manual-deadlines.json` now scopes ingestion by venue, edition,
track, and section, while the parser owns the label matching for common
milestone names. That keeps venue config declarative and reduces exact-string
overrides.

## Source health contract

`SourceSnapshot.extractedJson` is now the public health envelope consumed by the
app. New fetch and ingest runs write a versioned structure with:

- `fetch`: request URL, final URL, content type, fetch timestamp, and HTTP status
- `change`: hash-level snapshot change status plus the previous snapshot pointer
- `parsing`: parser status, parser id, parsed deadline summary, and milestone-aware diff metadata where parser coverage exists
- `ingest`: ingest status, imported deadline count, and an explicit queue payload for parser or missing-snapshot failures

The public UI derives trust badges, parser labels, and the `/health/` failure
queue from this envelope instead of treating missing deadlines as silent gaps.

## Change-event contract

Phase 2 adds a durable `DeadlineEvent` history table for downstream feeds,
timelines, and alerts. Each row is keyed to the exact source snapshot that
detected the change and stores:

- `eventType`: one of `deadline_added`, `deadline_removed`,
  `deadline_rescheduled`, `deadline_hardness_changed`, or
  `deadline_metadata_changed`
- `milestoneKind` and `milestoneName`: the impacted normalized milestone
- `previousValueJson` and `currentValueJson`: snapshot-level before/after values
- `fieldChangesJson`: per-field deltas when the milestone was modified
- `sourceKey`, `sourceKind`, `sourceUrl`, and `sourceAuthority`: source
  authority and provenance for alerts or UI copy
- `venueId`, `editionId`, `trackId`, and `detectedAt`: venue-scoped history
  coordinates and ordering metadata

The ingest worker preserves milestone-aware diffs in
`SourceSnapshot.extractedJson.parsing.diff`, projects those diffs into durable
`DeadlineEvent` rows, and exposes them through app-level read helpers for global
change feeds and per-venue history views. See
[`docs/change-event-contract.md`](docs/change-event-contract.md) for the full
contract.

## Workflow adoption instrumentation

Phase 2 also adds browser-local workflow instrumentation so the team can measure
whether discovery and saved-watchlist flows are replacing manual spreadsheet or
calendar tracking without requiring backend infrastructure.

- events are stored in `localStorage` under `workflow-analytics-v1`
- session-level metrics include search-to-save conversion, repeat returns,
  watchlist creation, compare-mode launches, venue-history opens, and change-feed
  drilldowns
- the home page now shows a workflow adoption dashboard plus an explicit
  `waiting for approval` queue for manual-override deadlines that still lack a
  verified source snapshot
- export interactions now track ICS downloads, machine-readable exports, and
  copied calendar-feed URLs for the current filtered slice

## Export workflows

Phase 2 now ships client-side export flows inside the discovery workspace:

- current filtered slices can be exported directly as `.ics`, `.json`, or `.csv`
- calendar-feed URLs are generated from the same scoped slice so saved views can
  move from discovery to subscription without spreadsheet copy-paste
- export scope and freshness are shown in the UI before generation so users know
  what each artifact represents

## Known gaps

- Monitoring-only sources still need dedicated parser coverage before they can produce milestone-level diffs.
- Manual overrides are still the fallback for venue-specific exceptions the shared parser cannot infer safely.

## Wave 2 temporary handling

- CoRL 2026 is tracked through the official homepage and author-instructions page, but it remains monitoring-only until the conference publishes a cleaner machine-parseable dates source.
- SIGIR 2026 is tracked through the SIGIR organization homepage for now because the year-specific conference site or CFP page is not yet stable enough to treat as a canonical parser source.

## Wave 1 source authority notes

- NAACL coverage uses the latest stable official main-conference source available on March 30, 2026: the NAACL 2025 papers call page with ARR commitment dates.
- ICCV coverage uses the latest stable official main-conference source available on March 30, 2026: the ICCV 2025 CVF dates page.

Next parser targets:

- Venue-specific parsers for monitoring-only official sources such as CoRL and SIGIR once their canonical date pages settle
