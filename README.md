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

## Initial registry scope

The curated starter set covers:

- NeurIPS
- ICML
- ICLR
- CVPR
- ACL
- EMNLP

This is intentionally enough to support the first ingestion path and public list view, without overfitting the schema to one venue family.

## Parser coverage

The current production parser targets the shared conference `.../Dates` page
template used by ICLR, NeurIPS, ICML, and CVPR. It normalizes the canonical
milestones the page exposes for each venue, including:

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

## Change detection

`pnpm worker:fetch -- <venue> <source>` now compares the freshly fetched
snapshot hash against the previous snapshot for that source and records a simple
change signal in `SourceSnapshot.extractedJson`:

- `first_snapshot` when no prior fetch exists
- `unchanged` when the content hash matches the prior snapshot
- `changed` when the source content hash differs from the prior snapshot

## Known gaps

- ACL and EMNLP still need targeted official dates sources or venue-specific parsers.
- The current diff signal is hash-based; it does not yet classify which milestones changed.
- Manual overrides are still the fallback for venue-specific exceptions the shared parser cannot infer safely.

Next parser targets:

- ACL official dates or CFP page
- EMNLP official dates page
- Venue-specific parsers for sites that do not use the shared conference template
