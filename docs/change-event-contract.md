# Deadline Event Contract

`DeadlineEvent` is the durable change-history primitive for feeds, venue
timelines, and alerts.

## Stored fields

- `eventType`: `deadline_added`, `deadline_removed`, `deadline_rescheduled`,
  `deadline_hardness_changed`, or `deadline_metadata_changed`
- `milestoneKind`: normalized milestone key such as `paper_submission`
- `milestoneName`: human-readable milestone label captured at detection time
- `previousValueJson`: prior parsed milestone payload or `null`
- `currentValueJson`: new parsed milestone payload or `null`
- `fieldChangesJson`: array of changed fields for modified milestones
- `sourceKey`, `sourceKind`, `sourceUrl`, `sourceAuthority`: provenance for the
  authoritative upstream source
- `venueId`, `editionId`, `trackId`: venue-scoped coordinates for history and
  alert routing
- `sourceSnapshotId`: exact snapshot that produced the event
- `detectedAt`: event timestamp, aligned to the snapshot fetch time

## Semantics

- One stored row represents one meaningful milestone change for one snapshot.
- Added and removed milestones carry only `currentValueJson` or
  `previousValueJson`.
- Modified milestones carry both before and after payloads, plus
  `fieldChangesJson`.
- `deadline_rescheduled` takes precedence when `dueAt` changes.
- `deadline_hardness_changed` is used when only hard-vs-soft deadline semantics
  change.
- Any remaining modifications fall under `deadline_metadata_changed`.

## Read primitives

- `getRecentDeadlineEvents(limit)` returns the global reverse-chronological feed
- `getVenueDeadlineDetail(slug).history` returns the venue-scoped event history

Consumers should treat `previousValueJson`, `currentValueJson`, and
`fieldChangesJson` as the canonical payload for rendering alert copy or
history-row details, without reparsing raw snapshot HTML.
