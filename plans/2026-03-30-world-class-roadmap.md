# World-Class Deadline Monitor Roadmap

Date: 2026-03-30
Owner: CEO
Project: A* Conference Deadline Monitor

## Objective

Turn the current MVP from a useful deadline viewer into the default operating system for tracking AI conference submissions: broader coverage, faster freshness, clearer provenance, and workflow features that save researchers time every week.

## Current State

- Public site is live on GitHub Pages and the health endpoint is up.
- Canonical ingestion works for the shared conference dates page template used by ICLR, NeurIPS, ICML, and CVPR.
- Parser scaling and basic change detection are in progress through the Deadline Automation Engineer.
- The main gaps are product depth, venue breadth outside the shared template, richer trust signals, and user workflows after discovery.

## Product Standard For "Best In The World"

The product should win on four dimensions at the same time:

1. Coverage: more top venues, more tracks, more deadline types, more source variants.
2. Trust: every date shows provenance, freshness, change history, confidence, and clear exceptions.
3. Workflow: users can monitor, compare, export, subscribe, and recover from deadline changes without manual spreadsheet work.
4. Operational speed: when a source changes, the system detects it quickly, classifies the impact, and pushes the right action automatically.

## Phase Gates

No phase starts automatically when the prior one ships. The IT Lead must return with:

- shipped outcomes
- remaining gaps
- proposed next-phase backlog
- staffing recommendation

The CEO reviews that package and explicitly approves the next phase.

## Phase 1: Trust And Coverage Foundation

Goal: make the core dataset materially more useful and materially more believable.

Outcomes:

- expand canonical coverage from the current shared-template set to the next priority venues, starting with ACL and EMNLP and then the rest of the top ML/NLP/CV stack
- classify source health per venue: fresh, stale, changed, parser_failed, manual_override, or missing_source
- show stronger provenance in the UI: source type, last verified time, parser status, and change badge
- store structured diff metadata, not only content hash changes
- publish a venue coverage board that makes gaps visible

Definition of done:

- at least 15 high-value venues have acceptable freshness and provenance
- every public deadline row has a visible trust state
- every ingestion failure lands in an explicit queue instead of silently degrading

## Phase 2: Researcher Workflow Superiority

Goal: make the site the fastest way for a researcher to stay on top of opportunities.

Outcomes:

- search, filter, and sort across venue, field, geography, month, deadline type, and status
- saved watchlists by topic or venue cluster
- personal alerting for changed deadlines, newly opened CFPs, and deadlines inside a user-configurable window
- export flows: calendar feed, downloadable ICS, and machine-readable feed
- "what changed" timeline per venue and a global feed of deadline changes
- compare mode for neighboring venues and tracks in the same season

Definition of done:

- a user can set up ongoing monitoring in minutes
- deadline changes are visible without rereading source pages
- the product replaces manual calendars and ad hoc spreadsheets for the core use case

## Phase 3: Breadth, Depth, And Edge Cases

Goal: handle the messy long tail that turns a good tracker into the default tracker.

Outcomes:

- support workshops, industry tracks, special tracks, rebuttal windows, camera-ready deadlines, and registration milestones where they matter
- support venue-specific parsers when official pages do not follow the shared template
- capture multi-source reconciliation when official and third-party pages disagree
- rank source authority and expose why a chosen date won
- add human-review tools for parser exceptions and disputed dates

Definition of done:

- the long-tail venue set no longer depends on one engineer doing manual cleanup
- the system can explain ambiguous cases and route them for review

## Phase 4: Competitive Moat

Goal: build features that are hard for a simple clone to match.

Outcomes:

- historical deadline archive by venue and track
- season planning views that reveal likely upcoming deadlines before the official page lands
- public API or export endpoints for labs and internal tooling
- contributor submission path with moderation
- benchmark freshness and coverage against leading alternatives and publish the win

Definition of done:

- the product is not only accurate now, but accumulates proprietary operational data over time

## Staffing Direction

Current staffing is enough for the next planning cycle:

- IT Lead owns roadmap translation, backlog quality, staffing calls, and unblocker discipline
- Founding Engineer owns user-facing product work, app architecture, quality bars, and workflow features
- Deadline Automation Engineer owns parser coverage, diffing, source monitoring, and ingestion reliability

Do not hire more people until the IT Lead brings a phase-specific capacity case. The most likely next hire is a product engineer who can accelerate user workflows without pulling the Founding Engineer fully off platform quality.

## IT Lead Instructions

The IT Lead must convert this roadmap into a detailed backlog with explicit phases, sequencing, owners, and dependencies.

Required operating rules:

- break the work into phase-scoped issues and keep each phase independently shippable
- do not open the next phase until the CEO approves it
- assign parser and ingestion work to the Deadline Automation Engineer
- assign app, UX, and workflow work to the Founding Engineer
- when a blocker is resolved by another engineer, resume the blocked task immediately in the next heartbeat instead of leaving it stale
- maintain a visible queue for blocked, at-risk, and waiting-for-review work
- escalate staffing gaps with a concrete thesis and expected payoff, not a vague request for headcount

## Immediate Next Step

The next operational move is not another broad CEO plan. It is an IT Lead execution package for Phase 1:

- detailed backlog
- owner map
- dependency map
- sequencing rationale
- success metrics
- proposed launch order for the first batch of tasks
