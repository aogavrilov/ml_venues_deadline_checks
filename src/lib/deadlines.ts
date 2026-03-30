import "server-only";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import overrides from "../../data/overrides/manual-deadlines.json";

type SnapshotChangeStatus = "first_snapshot" | "changed" | "unchanged" | null;
type TrustState = "fresh" | "stale" | "changed" | "parser_failed" | "manual_override" | "missing_source";
type ParsingStatus = "parsed" | "failed" | "unavailable" | undefined;
type IngestStatus = "pending" | "succeeded" | "failed" | undefined;
type DeadlineEventType =
  | "deadline_added"
  | "deadline_removed"
  | "deadline_rescheduled"
  | "deadline_hardness_changed"
  | "deadline_metadata_changed";

type DeadlineIndexRow = {
  id: string;
  name: string;
  kind: string;
  dueAt: string;
  timezone: string;
  isHard: number;
  notes: string | null;
  venueSlug: string;
  venueName: string;
  venueArea: string;
  venueTimezone: string;
  editionLabel: string;
  editionYear: number;
  editionLocationName: string | null;
  trackName: string | null;
  sourceKey: string | null;
  sourceUrl: string | null;
  sourceKind: string | null;
  snapshotStatus: string | null;
  extractedJson: string | null;
  lastVerifiedAt: string | null;
};

type VenueSummaryRow = {
  slug: string;
  name: string;
  sourceCount: number;
  deadlineCount: number;
};

type VenueDetailRow = {
  venueSlug: string;
  venueName: string;
  venueSeries: string;
  venueTimezone: string;
  editionId: string | null;
  editionLabel: string | null;
  editionStatus: string | null;
  editionYear: number | null;
  deadlineId: string | null;
  deadlineName: string | null;
  deadlineKind: string | null;
  deadlineDueAt: string | null;
  deadlineTimezone: string | null;
  deadlineIsHard: number | null;
  deadlineNotes: string | null;
  trackName: string | null;
  sourceKey: string | null;
  sourceUrl: string | null;
  sourceKind: string | null;
  snapshotStatus: string | null;
  extractedJson: string | null;
  lastVerifiedAt: string | null;
};

type SourceRow = {
  venueSlug?: string;
  venueName?: string;
  key: string;
  url: string;
  kind: string;
  isCanonical: number;
  notes: string;
  snapshotStatus: string | null;
  extractedJson: string | null;
  errorMessage: string | null;
  lastVerifiedAt: string | null;
};

type DeadlineEventRow = {
  id: string;
  eventType: DeadlineEventType;
  milestoneKind: string;
  milestoneName: string;
  detectedAt: string;
  previousValueJson: string | null;
  currentValueJson: string | null;
  fieldChangesJson: string | null;
  sourceKey: string;
  sourceKind: string;
  sourceUrl: string;
  sourceAuthority: string;
  venueSlug: string;
  venueName: string;
  editionLabel: string | null;
  editionYear: number | null;
  trackName: string | null;
};

export type DeadlineEventValue = {
  kind: string;
  name: string;
  dueAt: string;
  isHard: boolean;
  sourceLabel?: string | null;
  section?: string | null;
};

export type DeadlineEventFieldChange = {
  field: string;
  previous: string | boolean | null;
  current: string | boolean | null;
};

export type DeadlineEventFeedItem = {
  id: string;
  eventType: DeadlineEventType;
  milestoneKind: string;
  milestoneName: string;
  detectedAt: string;
  sourceKey: string;
  sourceKind: string;
  sourceUrl: string;
  sourceAuthority: string;
  venueSlug: string;
  venueName: string;
  editionLabel: string | null;
  editionYear: number | null;
  trackName: string | null;
  previousValue: DeadlineEventValue | null;
  currentValue: DeadlineEventValue | null;
  fieldChanges: DeadlineEventFieldChange[];
  summary: {
    label: string;
    tone: "positive" | "critical" | "attention" | "warning" | "neutral";
    detail: string;
  };
};

type SnapshotMetadata = {
  schemaVersion?: number;
  source?: {
    venueSlug?: string;
    sourceKey?: string;
    sourceUrl?: string;
  };
  fetch?: {
    fetchedAt?: string;
    fetchedUrl?: string;
    finalUrl?: string;
    contentType?: string | null;
    httpStatus?: number | null;
  };
  fetchedAt?: string;
  change?: {
    status?: SnapshotChangeStatus;
    previousSnapshotId?: string | null;
    previousFetchedAt?: string | null;
  };
  parsing?: {
    status?: ParsingStatus;
    parser?: string | null;
    editionYear?: number | null;
    deadlineCount?: number | null;
    error?: string | null;
    deadlines?: Array<{
      kind: string;
      name: string;
      dueAt: string;
      isHard: boolean;
      sourceLabel?: string | null;
      section?: string | null;
    }>;
    diff?: {
      status?: string;
      changedKinds?: string[];
      changes?: Array<{
        kind: string;
        changeType: string;
        fieldChanges?: Array<{
          field: string;
          previous: string | boolean | null;
          current: string | boolean | null;
        }>;
      }>;
    };
  };
  ingest?: {
    status?: IngestStatus;
    error?: string | null;
    importedDeadlineCount?: number | null;
    queue?: Array<{
      code: string;
      venueSlug: string;
      sourceKey: string;
      editionYear: number;
    }>;
  };
};

type ParserConfig = (typeof overrides.entries)[number];
type TrustSummary = ReturnType<typeof getTrustSummary>;
type ChangeSummary = ReturnType<typeof getChangeSummary>;
type ParserSummary = ReturnType<typeof getParserSummary>;
type FailureQueueItem = {
  venueSlug: string;
  venueName: string;
  sourceKey: string;
  sourceUrl: string;
  issueType: "parser_failed" | "fetch_failed" | "missing_source" | "missing_parser";
  detail: string;
  lastVerifiedAt: Date | null;
};
type QueueName = "blocked" | "at_risk" | "waiting_review" | "waiting_approval";
type QueueItem = FailureQueueItem & {
  queue: QueueName;
  tone: "critical" | "warning" | "attention";
  actionLabel: string;
};
type VenueCoverageStatus = "covered" | "partial" | "monitoring_only" | "missing";
type VenueCoverageItem = {
  slug: string;
  name: string;
  deadlineCount: number;
  sourceCount: number;
  coveredSourceCount: number;
  monitoringSourceCount: number;
  freshness: ReturnType<typeof getVenueFreshnessSummary>;
  coverage: {
    status: VenueCoverageStatus;
    label: string;
    tone: "positive" | "warning" | "neutral";
    detail: string;
  };
};

export type DeadlineBrowseEntry = {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  dueAt: string;
  timezone: string;
  isHard: boolean;
  notes: string | null;
  venueSlug: string;
  venueName: string;
  venueArea: string;
  venueAreaLabel: string;
  venueTimezone: string;
  geography: string;
  geographyLabel: string;
  editionLabel: string;
  editionYear: number;
  editionLocationName: string | null;
  trackName: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceType: string;
  sourceTypeLabel: string;
  status: TrustState;
  statusLabel: string;
  statusTone: string;
  statusDetail: string;
  parserLabel: string;
  parserDetail: string;
  lastVerifiedAt: string | null;
  month: string;
  monthLabel: string;
};

export type DeadlineBrowseDataset = {
  deadlines: DeadlineBrowseEntry[];
  facets: {
    fields: Array<{ value: string; label: string; count: number }>;
    geographies: Array<{ value: string; label: string; count: number }>;
    months: Array<{ value: string; label: string; count: number }>;
    deadlineTypes: Array<{ value: string; label: string; count: number }>;
    statuses: Array<{ value: string; label: string; count: number }>;
    sourceTypes: Array<{ value: string; label: string; count: number }>;
  };
  summary: {
    deadlineCount: number;
    venueCount: number;
  };
};

const parserConfigByVenueEdition = new Map(
  overrides.entries.map((entry) => [`${entry.venueSlug}:${entry.editionYear}`, entry] as const)
);

const staleThresholdMs = 1000 * 60 * 60 * 24 * 7;

function openDatabase() {
  return new DatabaseSync(path.join(process.cwd(), "prisma", "dev.db"), {
    readOnly: true
  });
}

function fromSqliteDate(value: string | null) {
  return value ? new Date(value) : null;
}

function titleCase(value: string) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function parseSnapshotMetadata(raw: string | null): SnapshotMetadata | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SnapshotMetadata;
  } catch {
    return null;
  }
}

function parseJsonValue<T>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getFetchedAt(metadata: SnapshotMetadata | null) {
  return metadata?.fetch?.fetchedAt ?? metadata?.fetchedAt ?? null;
}

function getParsingStatus(snapshotStatus: string | null, metadata: SnapshotMetadata | null) {
  if (snapshotStatus === "failed") {
    return "failed";
  }

  return metadata?.parsing?.status;
}

function getIngestStatus(metadata: SnapshotMetadata | null) {
  return metadata?.ingest?.status;
}

function getFailureDetail(snapshotStatus: string | null, metadata: SnapshotMetadata | null, fallback: string | null) {
  if (snapshotStatus === "failed") {
    return fallback ?? "Latest fetch failed";
  }

  return metadata?.ingest?.error ?? metadata?.parsing?.error ?? fallback;
}

function getParserConfig(venueSlug: string, editionYear: number | null) {
  if (editionYear === null) {
    return null;
  }

  return parserConfigByVenueEdition.get(`${venueSlug}:${editionYear}`) ?? null;
}

function getSourceTypeLabel(kind: string | null) {
  if (!kind) {
    return "No source";
  }

  return `${titleCase(kind)} source`;
}

function getVenueAreaLabel(area: string) {
  switch (area) {
    case "ml":
      return "ML";
    case "cv":
      return "CV";
    case "nlp":
      return "NLP";
    case "robotics":
      return "Robotics";
    case "general":
      return "General AI";
    default:
      return titleCase(area);
  }
}

function getGeographyLabel(timezone: string, locationName: string | null) {
  if (locationName) {
    return locationName;
  }

  if (timezone.startsWith("America/")) {
    return "Americas";
  }

  if (timezone.startsWith("Europe/")) {
    return "Europe";
  }

  if (timezone.startsWith("Asia/")) {
    return "Asia";
  }

  if (timezone.startsWith("Australia/")) {
    return "Oceania";
  }

  if (timezone.startsWith("Pacific/")) {
    return "Pacific";
  }

  return timezone.split("/")[0] ? titleCase(timezone.split("/")[0]) : "Global";
}

function slugifyFacetValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function buildFacetCounts(entries: DeadlineBrowseEntry[], selectValue: (entry: DeadlineBrowseEntry) => string) {
  const counts = new Map<string, { value: string; label: string; count: number }>();

  for (const entry of entries) {
    const value = selectValue(entry);
    const existing = counts.get(value);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(value, {
      value,
      label: value,
      count: 1
    });
  }

  return [...counts.values()];
}

function getChangeSummary(changeStatus: SnapshotChangeStatus) {
  switch (changeStatus) {
    case "changed":
      return {
        label: "Change detected",
        tone: "attention",
        detail: "Tracked milestone data changed on the latest source check"
      };
    case "unchanged":
      return {
        label: "No source change",
        tone: "neutral",
        detail: "Tracked milestones match the previous verified snapshot"
      };
    case "first_snapshot":
      return {
        label: "First snapshot",
        tone: "info",
        detail: "This is the first structured snapshot for this source"
      };
    default:
      return null;
  }
}

function getDeadlineEventSummary(event: {
  eventType: DeadlineEventType;
  milestoneName: string;
  previousValue: {
    dueAt?: string;
    isHard?: boolean;
  } | null;
  currentValue: {
    dueAt?: string;
    isHard?: boolean;
  } | null;
  fieldChanges: Array<{
    field: string;
    previous: string | boolean | null;
    current: string | boolean | null;
  }>;
}) {
  switch (event.eventType) {
    case "deadline_added":
      return {
        label: "Added",
        tone: "positive" as const,
        detail: `${event.milestoneName} appeared in the tracked source`
      };
    case "deadline_removed":
      return {
        label: "Removed",
        tone: "critical" as const,
        detail: `${event.milestoneName} disappeared from the tracked source`
      };
    case "deadline_rescheduled":
      return {
        label: "Rescheduled",
        tone: "attention" as const,
        detail:
          event.previousValue?.dueAt && event.currentValue?.dueAt
            ? `${event.milestoneName} moved from ${event.previousValue.dueAt} to ${event.currentValue.dueAt}`
            : `${event.milestoneName} changed schedule`
      };
    case "deadline_hardness_changed":
      return {
        label: "Hardness changed",
        tone: "warning" as const,
        detail:
          event.previousValue?.isHard !== undefined && event.currentValue?.isHard !== undefined
            ? `${event.milestoneName} changed from ${event.previousValue.isHard ? "hard deadline" : "milestone"} to ${
                event.currentValue.isHard ? "hard deadline" : "milestone"
              }`
            : `${event.milestoneName} changed deadline hardness`
      };
    default: {
      const changedFields = event.fieldChanges.map((entry) => titleCase(entry.field)).join(", ");

      return {
        label: "Metadata changed",
        tone: "neutral" as const,
        detail: changedFields
          ? `${event.milestoneName} changed ${changedFields.toLowerCase()}`
          : `${event.milestoneName} changed metadata`
      };
    }
  }
}

function formatDeadlineEvent(row: DeadlineEventRow) {
  const previousValue = parseJsonValue<DeadlineEventValue>(row.previousValueJson);
  const currentValue = parseJsonValue<DeadlineEventValue>(row.currentValueJson);
  const fieldChanges =
    parseJsonValue<DeadlineEventFieldChange[]>(row.fieldChangesJson) ?? [];

  return {
    id: row.id,
    eventType: row.eventType,
    milestoneKind: row.milestoneKind,
    milestoneName: row.milestoneName,
    detectedAt: new Date(row.detectedAt).toISOString(),
    sourceKey: row.sourceKey,
    sourceKind: row.sourceKind,
    sourceUrl: row.sourceUrl,
    sourceAuthority: row.sourceAuthority,
    venueSlug: row.venueSlug,
    venueName: row.venueName,
    editionLabel: row.editionLabel,
    editionYear: row.editionYear,
    trackName: row.trackName,
    previousValue,
    currentValue,
    fieldChanges,
    summary: getDeadlineEventSummary({
      eventType: row.eventType,
      milestoneName: row.milestoneName,
      previousValue,
      currentValue,
      fieldChanges
    })
  };
}

function getTrustSummary(params: {
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
  snapshotStatus: string | null;
  parsingStatus?: ParsingStatus;
  ingestStatus?: IngestStatus;
  changeStatus: SnapshotChangeStatus;
}) {
  if (params.snapshotStatus === "failed" || params.parsingStatus === "failed" || params.ingestStatus === "failed") {
    return {
      state: "parser_failed" as const,
      label: "Parser failed",
      tone: "critical",
      detail: "Latest fetch, parse, or ingest run failed"
    };
  }

  if (!params.sourceUrl && !params.lastVerifiedAt) {
    return {
      state: "manual_override" as const,
      label: "Manual override",
      tone: "warning",
      detail: "Deadline exists without a linked verified snapshot"
    };
  }

  if (!params.sourceUrl) {
    return {
      state: "missing_source" as const,
      label: "Missing source",
      tone: "warning",
      detail: "Source link is not available yet"
    };
  }

  if (params.changeStatus === "changed") {
    return {
      state: "changed" as const,
      label: "Changed",
      tone: "attention",
      detail: "Source content changed on the latest verification"
    };
  }

  if (!params.lastVerifiedAt) {
    return {
      state: "missing_source" as const,
      label: "Unverified",
      tone: "warning",
      detail: "Verification timestamp is missing"
    };
  }

  if (Date.now() - params.lastVerifiedAt.getTime() > staleThresholdMs) {
    return {
      state: "stale" as const,
      label: "Stale",
      tone: "warning",
      detail: "Verification is older than seven days"
    };
  }

  return {
    state: "fresh" as const,
    label: "Fresh",
    tone: "positive",
    detail: "Recently verified against the tracked source"
  };
}

function getParserSummary(
  config: ParserConfig | null,
  snapshotStatus: string | null,
  metadata: SnapshotMetadata | null,
  hasLinkedSnapshot: boolean
) {
  if (snapshotStatus === "failed" || metadata?.parsing?.status === "failed" || metadata?.ingest?.status === "failed") {
    return {
      state: "failed" as const,
      label: "Parser failed",
      tone: "critical",
      parserName: config ? titleCase(config.parser) : null,
      detail: metadata?.ingest?.error ?? metadata?.parsing?.error ?? "Latest source run failed"
    };
  }

  if (!hasLinkedSnapshot) {
    return {
      state: "manual_override" as const,
      label: "Manual override",
      tone: "warning",
      parserName: null,
      detail: "Rendered without a linked source snapshot"
    };
  }

  if (!config) {
    return {
      state: "monitoring_only" as const,
      label: "Monitoring only",
      tone: "neutral",
      parserName: null,
      detail: "Source is tracked but not mapped to a deadline parser"
    };
  }

  if (metadata?.parsing?.status === "unavailable") {
    return {
      state: "monitoring_only" as const,
      label: "Monitoring only",
      tone: "neutral",
      parserName: titleCase(config.parser),
      detail: "Source is tracked without a parser for milestone extraction"
    };
  }

  return {
    state: "active" as const,
    label: "Parser active",
    tone: "positive",
    parserName: titleCase(config.parser),
    detail: config.notes
  };
}

function getVenueFreshnessSummary(stats: { blockedCount: number; changedCount: number; staleCount: number }) {
  if (stats.blockedCount > 0) {
    return {
      state: "blocked" as const,
      label: "Blocked",
      tone: "critical" as const,
      detail: "One or more tracked sources failed or are missing verification"
    };
  }

  if (stats.changedCount > 0) {
    return {
      state: "changed" as const,
      label: "Needs review",
      tone: "attention" as const,
      detail: "A tracked source changed and should be reviewed before relying on it"
    };
  }

  if (stats.staleCount > 0) {
    return {
      state: "stale" as const,
      label: "Stale",
      tone: "warning" as const,
      detail: "Tracked sources have not been verified in the last seven days"
    };
  }

  return {
    state: "fresh" as const,
    label: "Fresh",
    tone: "positive" as const,
    detail: "Tracked sources are recently verified"
  };
}

function getCoverageSummary(stats: { deadlineCount: number; coveredSourceCount: number; monitoringSourceCount: number }) {
  if (stats.deadlineCount === 0 && stats.coveredSourceCount === 0) {
    return {
      status: "missing" as const,
      label: "Missing deadlines",
      tone: "warning" as const,
      detail: "No normalized deadlines are currently live for this venue"
    };
  }

  if (stats.coveredSourceCount === 0 && stats.monitoringSourceCount > 0) {
    return {
      status: "monitoring_only" as const,
      label: "Monitoring only",
      tone: "neutral" as const,
      detail: "Sources are tracked, but parser-backed deadline extraction is not complete"
    };
  }

  if (stats.monitoringSourceCount > 0) {
    return {
      status: "partial" as const,
      label: "Partial coverage",
      tone: "warning" as const,
      detail: "At least one source still lacks parser-backed extraction coverage"
    };
  }

  return {
    status: "covered" as const,
    label: "Covered",
    tone: "positive" as const,
    detail: "Canonical deadline extraction is live for this venue"
  };
}

function buildSourceHealth(source: {
  venueSlug: string;
  venueName: string;
  sourceKey: string;
  sourceUrl: string;
  snapshotStatus: string | null;
  extractedJson: string | null;
  errorMessage: string | null;
  lastVerifiedAt: string | null;
  editionYear?: number | null;
}) {
  const metadata = parseSnapshotMetadata(source.extractedJson);
  const parserConfig =
    getParserConfig(source.venueSlug, source.editionYear ?? metadata?.parsing?.editionYear ?? null) ??
    overrides.entries.find((entry) => entry.venueSlug === source.venueSlug && entry.sourceKey === source.sourceKey) ??
    null;
  const lastVerifiedAt = fromSqliteDate(source.lastVerifiedAt ?? getFetchedAt(metadata));
  const changeStatus = metadata?.change?.status ?? null;
  const trust = getTrustSummary({
    sourceUrl: source.sourceUrl,
    lastVerifiedAt,
    snapshotStatus: source.snapshotStatus,
    parsingStatus: getParsingStatus(source.snapshotStatus, metadata),
    ingestStatus: getIngestStatus(metadata),
    changeStatus
  });
  const failure = buildFailureQueueItem({
    venueSlug: source.venueSlug,
    venueName: source.venueName,
    sourceKey: source.sourceKey,
    sourceUrl: source.sourceUrl,
    snapshotStatus: source.snapshotStatus,
    extractedJson: source.extractedJson,
    errorMessage: source.errorMessage,
    parserConfig,
    lastVerifiedAt: source.lastVerifiedAt ?? getFetchedAt(metadata)
  });

  return {
    metadata,
    parserConfig,
    trust,
    change: getChangeSummary(changeStatus),
    parser: getParserSummary(parserConfig, source.snapshotStatus, metadata, Boolean(lastVerifiedAt || source.sourceUrl)),
    lastVerifiedAt,
    failure
  };
}

function getQueueItemFromHealth(source: {
  venueSlug: string;
  venueName: string;
  sourceKey: string;
  sourceUrl: string;
  snapshotStatus: string | null;
  extractedJson: string | null;
  errorMessage: string | null;
  lastVerifiedAt: string | null;
  editionYear?: number | null;
}): QueueItem | null {
  const health = buildSourceHealth(source);

  if (health.failure) {
    const actionLabel =
      health.failure.issueType === "missing_parser"
        ? "Add parser coverage"
        : health.failure.issueType === "missing_source"
          ? "Fetch source snapshot"
          : "Fix fetch/parser failure";

    return {
      ...health.failure,
      queue: health.failure.issueType === "missing_parser" ? ("waiting_review" as const) : ("blocked" as const),
      tone: health.failure.issueType === "missing_parser" ? ("warning" as const) : ("critical" as const),
      actionLabel
    };
  }

  if (health.trust.state === "changed") {
    return {
      venueSlug: source.venueSlug,
      venueName: source.venueName,
      sourceKey: source.sourceKey,
      sourceUrl: source.sourceUrl,
      issueType: "missing_parser" as const,
      detail: health.change?.detail ?? "Tracked milestone data changed on the latest source check",
      lastVerifiedAt: health.lastVerifiedAt,
      queue: "waiting_review" as const,
      tone: "attention" as const,
      actionLabel: "Review changed milestones"
    };
  }

  if (health.trust.state === "stale") {
    return {
      venueSlug: source.venueSlug,
      venueName: source.venueName,
      sourceKey: source.sourceKey,
      sourceUrl: source.sourceUrl,
      issueType: "missing_source" as const,
      detail: health.trust.detail,
      lastVerifiedAt: health.lastVerifiedAt,
      queue: "at_risk" as const,
      tone: "warning" as const,
      actionLabel: "Re-run source verification"
    };
  }

  return null;
}

function buildDeadlineTrust(params: {
  venueSlug: string;
  editionYear: number;
  sourceUrl: string | null;
  sourceKind: string | null;
  snapshotStatus: string | null;
  extractedJson: string | null;
  lastVerifiedAt: string | null;
}) {
  const metadata = parseSnapshotMetadata(params.extractedJson);
  const lastVerifiedAt = fromSqliteDate(params.lastVerifiedAt ?? getFetchedAt(metadata));
  const changeStatus = metadata?.change?.status ?? null;
  const parserConfig = getParserConfig(params.venueSlug, params.editionYear);
  const parsingStatus = getParsingStatus(params.snapshotStatus, metadata);
  const ingestStatus = getIngestStatus(metadata);

  return {
    trust: getTrustSummary({
      sourceUrl: params.sourceUrl,
      lastVerifiedAt,
      snapshotStatus: params.snapshotStatus,
      parsingStatus,
      ingestStatus,
      changeStatus
    }),
    change: getChangeSummary(changeStatus),
    parser: getParserSummary(parserConfig, params.snapshotStatus, metadata, Boolean(params.lastVerifiedAt || params.sourceUrl)),
    sourceTypeLabel: getSourceTypeLabel(params.sourceKind),
    lastVerifiedAt,
    metadata
  };
}

function buildFailureQueueItem(params: {
  venueSlug: string;
  venueName: string;
  sourceKey: string;
  sourceUrl: string;
  snapshotStatus: string | null;
  extractedJson: string | null;
  errorMessage: string | null;
  parserConfig: ParserConfig | null;
  lastVerifiedAt: string | null;
}): FailureQueueItem | null {
  const metadata = parseSnapshotMetadata(params.extractedJson);
  const detail = getFailureDetail(params.snapshotStatus, metadata, params.errorMessage);

  if (params.snapshotStatus === "failed") {
    return {
      venueSlug: params.venueSlug,
      venueName: params.venueName,
      sourceKey: params.sourceKey,
      sourceUrl: params.sourceUrl,
      issueType: "fetch_failed",
      detail: detail ?? "Latest fetch failed",
      lastVerifiedAt: fromSqliteDate(params.lastVerifiedAt)
    };
  }

  if (metadata?.parsing?.status === "failed" || metadata?.ingest?.status === "failed") {
    return {
      venueSlug: params.venueSlug,
      venueName: params.venueName,
      sourceKey: params.sourceKey,
      sourceUrl: params.sourceUrl,
      issueType: "parser_failed",
      detail: detail ?? "Latest parser or ingest run failed",
      lastVerifiedAt: fromSqliteDate(params.lastVerifiedAt)
    };
  }

  if (!params.lastVerifiedAt) {
    return {
      venueSlug: params.venueSlug,
      venueName: params.venueName,
      sourceKey: params.sourceKey,
      sourceUrl: params.sourceUrl,
      issueType: "missing_source",
      detail: "No verified snapshot has been recorded for this tracked source",
      lastVerifiedAt: null
    };
  }

  if (!params.parserConfig && params.sourceUrl) {
    return {
      venueSlug: params.venueSlug,
      venueName: params.venueName,
      sourceKey: params.sourceKey,
      sourceUrl: params.sourceUrl,
      issueType: "missing_parser",
      detail: "Source is tracked but not yet mapped to a deadline parser",
      lastVerifiedAt: fromSqliteDate(params.lastVerifiedAt)
    };
  }

  return null;
}

export async function getVenueSlugs() {
  const database = openDatabase();

  try {
    const rows = database
      .prepare(
        `
          SELECT "slug"
          FROM "Venue"
          WHERE "isActive" = 1
          ORDER BY "name" ASC
        `
      )
      .all() as Array<{ slug: string }>;

    return rows.map((row) => row.slug);
  } finally {
    database.close();
  }
}

export async function getDeadlineIndex() {
  const database = openDatabase();

  try {
    const deadlines = database
      .prepare(
        `
          SELECT
            "Deadline"."id" AS "id",
            "Deadline"."name" AS "name",
            "Deadline"."kind" AS "kind",
            "Deadline"."dueAt" AS "dueAt",
            "Deadline"."timezone" AS "timezone",
            "Deadline"."isHard" AS "isHard",
            "Deadline"."notes" AS "notes",
            "Venue"."slug" AS "venueSlug",
            "Venue"."name" AS "venueName",
            "Venue"."area" AS "venueArea",
            "Venue"."timezone" AS "venueTimezone",
            "Edition"."label" AS "editionLabel",
            "Edition"."year" AS "editionYear",
            "Edition"."locationName" AS "editionLocationName",
            "Track"."name" AS "trackName",
            "Source"."key" AS "sourceKey",
            "Source"."url" AS "sourceUrl",
            "Source"."kind" AS "sourceKind",
            "SourceSnapshot"."status" AS "snapshotStatus",
            "SourceSnapshot"."extractedJson" AS "extractedJson",
            "SourceSnapshot"."fetchedAt" AS "lastVerifiedAt"
          FROM "Deadline"
          INNER JOIN "Venue" ON "Venue"."id" = "Deadline"."venueId"
          INNER JOIN "Edition" ON "Edition"."id" = "Deadline"."editionId"
          LEFT JOIN "Track" ON "Track"."id" = "Deadline"."trackId"
          LEFT JOIN "SourceSnapshot" ON "SourceSnapshot"."id" = "Deadline"."sourceSnapshotId"
          LEFT JOIN "Source" ON "Source"."id" = "SourceSnapshot"."sourceId"
          ORDER BY "Deadline"."dueAt" ASC, "Deadline"."name" ASC
        `
      )
      .all() as DeadlineIndexRow[];
    const venueSummary = database
      .prepare(
        `
          SELECT
            "Venue"."slug" AS "slug",
            "Venue"."name" AS "name",
            COUNT(DISTINCT "Source"."id") AS "sourceCount",
            COUNT(DISTINCT "Deadline"."id") AS "deadlineCount"
          FROM "Venue"
          LEFT JOIN "Source" ON "Source"."venueId" = "Venue"."id"
          LEFT JOIN "Deadline" ON "Deadline"."venueId" = "Venue"."id"
          GROUP BY "Venue"."id"
          ORDER BY "Venue"."name" ASC
        `
      )
      .all() as VenueSummaryRow[];

    return {
      deadlines: deadlines.map((deadline) => ({
        ...buildDeadlineTrust({
          venueSlug: deadline.venueSlug,
          editionYear: deadline.editionYear,
          sourceUrl: deadline.sourceUrl,
          sourceKind: deadline.sourceKind,
          snapshotStatus: deadline.snapshotStatus,
          extractedJson: deadline.extractedJson,
          lastVerifiedAt: deadline.lastVerifiedAt
        }),
        id: deadline.id,
        name: deadline.name,
        kind: deadline.kind,
        dueAt: new Date(deadline.dueAt),
        timezone: deadline.timezone,
        isHard: Boolean(deadline.isHard),
        notes: deadline.notes,
        venueSlug: deadline.venueSlug,
        venueName: deadline.venueName,
        venueArea: deadline.venueArea,
        venueTimezone: deadline.venueTimezone,
        editionLabel: deadline.editionLabel,
        editionLocationName: deadline.editionLocationName,
        trackName: deadline.trackName,
        sourceLabel: deadline.sourceKey,
        sourceUrl: deadline.sourceUrl,
        editionYear: deadline.editionYear
      })),
      venueSummary
    };
  } finally {
    database.close();
  }
}

export async function getDeadlineBrowseData(): Promise<DeadlineBrowseDataset> {
  const { deadlines } = await getDeadlineIndex();
  const entries: DeadlineBrowseEntry[] = deadlines.map((deadline) => {
    const monthLabel = getMonthLabel(deadline.dueAt);
    const geographyLabel = getGeographyLabel(deadline.venueTimezone, deadline.editionLocationName);

    return {
      id: deadline.id,
      name: deadline.name,
      kind: deadline.kind,
      kindLabel: titleCase(deadline.kind),
      dueAt: deadline.dueAt.toISOString(),
      timezone: deadline.timezone,
      isHard: deadline.isHard,
      notes: deadline.notes,
      venueSlug: deadline.venueSlug,
      venueName: deadline.venueName,
      venueArea: deadline.venueArea,
      venueAreaLabel: getVenueAreaLabel(deadline.venueArea),
      venueTimezone: deadline.venueTimezone,
      geography: slugifyFacetValue(geographyLabel),
      geographyLabel,
      editionLabel: deadline.editionLabel,
      editionYear: deadline.editionYear,
      editionLocationName: deadline.editionLocationName,
      trackName: deadline.trackName,
      sourceLabel: deadline.sourceLabel,
      sourceUrl: deadline.sourceUrl,
      sourceType: deadline.sourceTypeLabel,
      sourceTypeLabel: deadline.sourceTypeLabel,
      status: deadline.trust.state,
      statusLabel: deadline.trust.label,
      statusTone: deadline.trust.tone,
      statusDetail: deadline.trust.detail,
      parserLabel: deadline.parser.label,
      parserDetail: deadline.parser.detail,
      lastVerifiedAt: deadline.lastVerifiedAt ? deadline.lastVerifiedAt.toISOString() : null,
      month: `${deadline.dueAt.getUTCFullYear()}-${String(deadline.dueAt.getUTCMonth() + 1).padStart(2, "0")}`,
      monthLabel
    };
  });

  const fields = buildFacetCounts(entries, (entry) => entry.venueArea).map((item) => ({
    ...item,
    label: getVenueAreaLabel(item.value)
  }));
  const geographies = buildFacetCounts(entries, (entry) => entry.geography).map((item) => ({
    ...item,
    label: entries.find((entry) => entry.geography === item.value)?.geographyLabel ?? item.value
  }));
  const months = buildFacetCounts(entries, (entry) => entry.month).map((item) => ({
    ...item,
    label: entries.find((entry) => entry.month === item.value)?.monthLabel ?? item.value
  }));
  const deadlineTypes = buildFacetCounts(entries, (entry) => entry.kind).map((item) => ({
    ...item,
    label: titleCase(item.value)
  }));
  const statuses = buildFacetCounts(entries, (entry) => entry.status).map((item) => ({
    ...item,
    label: entries.find((entry) => entry.status === item.value)?.statusLabel ?? item.value
  }));
  const sourceTypes = buildFacetCounts(entries, (entry) => entry.sourceType).map((item) => ({
    ...item,
    label: item.value
  }));

  return {
    deadlines: entries,
    facets: {
      fields,
      geographies,
      months,
      deadlineTypes,
      statuses,
      sourceTypes
    },
    summary: {
      deadlineCount: entries.length,
      venueCount: new Set(entries.map((entry) => entry.venueSlug)).size
    }
  };
}

export async function getVenueDeadlineDetail(slug: string) {
  const database = openDatabase();

  try {
    const rows = database
      .prepare(
        `
          SELECT
            "Venue"."slug" AS "venueSlug",
            "Venue"."name" AS "venueName",
            "Venue"."series" AS "venueSeries",
            "Venue"."timezone" AS "venueTimezone",
            "Edition"."id" AS "editionId",
            "Edition"."label" AS "editionLabel",
            "Edition"."status" AS "editionStatus",
            "Edition"."year" AS "editionYear",
            "Deadline"."id" AS "deadlineId",
            "Deadline"."name" AS "deadlineName",
            "Deadline"."kind" AS "deadlineKind",
            "Deadline"."dueAt" AS "deadlineDueAt",
            "Deadline"."timezone" AS "deadlineTimezone",
            "Deadline"."isHard" AS "deadlineIsHard",
            "Deadline"."notes" AS "deadlineNotes",
            "Track"."name" AS "trackName",
            "Source"."key" AS "sourceKey",
            "Source"."url" AS "sourceUrl",
            "Source"."kind" AS "sourceKind",
            "SourceSnapshot"."status" AS "snapshotStatus",
            "SourceSnapshot"."extractedJson" AS "extractedJson",
            "SourceSnapshot"."fetchedAt" AS "lastVerifiedAt"
          FROM "Venue"
          LEFT JOIN "Edition" ON "Edition"."venueId" = "Venue"."id"
          LEFT JOIN "Deadline" ON "Deadline"."editionId" = "Edition"."id"
          LEFT JOIN "Track" ON "Track"."id" = "Deadline"."trackId"
          LEFT JOIN "SourceSnapshot" ON "SourceSnapshot"."id" = "Deadline"."sourceSnapshotId"
          LEFT JOIN "Source" ON "Source"."id" = "SourceSnapshot"."sourceId"
          WHERE "Venue"."slug" = ?
          ORDER BY "Edition"."year" DESC, "Deadline"."dueAt" ASC, "Deadline"."name" ASC
        `
      )
      .all(slug) as VenueDetailRow[];

    if (rows.length === 0) {
      return null;
    }

    const sources = database
      .prepare(
        `
          SELECT
            "Source"."key" AS "key",
            "Source"."url" AS "url",
            "Source"."kind" AS "kind",
            "Source"."isCanonical" AS "isCanonical",
            "Source"."notes" AS "notes",
            "SourceSnapshot"."status" AS "snapshotStatus",
            "SourceSnapshot"."extractedJson" AS "extractedJson",
            "SourceSnapshot"."errorMessage" AS "errorMessage",
            "SourceSnapshot"."fetchedAt" AS "lastVerifiedAt"
          FROM "Source"
          INNER JOIN "Venue" ON "Venue"."id" = "Source"."venueId"
          LEFT JOIN "SourceSnapshot" ON "SourceSnapshot"."id" = (
            SELECT "LatestSnapshot"."id"
            FROM "SourceSnapshot" AS "LatestSnapshot"
            WHERE "LatestSnapshot"."sourceId" = "Source"."id"
            ORDER BY "LatestSnapshot"."fetchedAt" DESC
            LIMIT 1
          )
          WHERE "Venue"."slug" = ?
          ORDER BY "Source"."isCanonical" DESC, "Source"."key" ASC
        `
      )
      .all(slug) as SourceRow[];
    const historyRows = database
      .prepare(
        `
          SELECT
            "DeadlineEvent"."id" AS "id",
            "DeadlineEvent"."eventType" AS "eventType",
            "DeadlineEvent"."milestoneKind" AS "milestoneKind",
            "DeadlineEvent"."milestoneName" AS "milestoneName",
            "DeadlineEvent"."detectedAt" AS "detectedAt",
            "DeadlineEvent"."previousValueJson" AS "previousValueJson",
            "DeadlineEvent"."currentValueJson" AS "currentValueJson",
            "DeadlineEvent"."fieldChangesJson" AS "fieldChangesJson",
            "DeadlineEvent"."sourceKey" AS "sourceKey",
            "DeadlineEvent"."sourceKind" AS "sourceKind",
            "DeadlineEvent"."sourceUrl" AS "sourceUrl",
            "DeadlineEvent"."sourceAuthority" AS "sourceAuthority",
            "Venue"."slug" AS "venueSlug",
            "Venue"."name" AS "venueName",
            "Edition"."label" AS "editionLabel",
            "Edition"."year" AS "editionYear",
            "Track"."name" AS "trackName"
          FROM "DeadlineEvent"
          INNER JOIN "Venue" ON "Venue"."id" = "DeadlineEvent"."venueId"
          LEFT JOIN "Edition" ON "Edition"."id" = "DeadlineEvent"."editionId"
          LEFT JOIN "Track" ON "Track"."id" = "DeadlineEvent"."trackId"
          WHERE "Venue"."slug" = ?
          ORDER BY "DeadlineEvent"."detectedAt" DESC, "DeadlineEvent"."createdAt" DESC
          LIMIT 12
        `
      )
      .all(slug) as DeadlineEventRow[];
    const firstRow = rows[0];
    const editionsById = new Map<
      string,
      {
        id: string;
        label: string;
        status: string;
        year: number;
        deadlines: Array<{
          trust: TrustSummary;
          change: ChangeSummary;
          parser: ParserSummary;
          sourceTypeLabel: string;
          id: string;
          name: string;
          kind: string;
          dueAt: Date;
          timezone: string;
          isHard: boolean;
          notes: string | null;
          trackName: string | null;
          sourceKey: string | null;
          sourceUrl: string | null;
          lastVerifiedAt: Date | null;
        }>;
      }
    >();

    for (const row of rows) {
      if (!row.editionId || !row.editionLabel || row.editionYear === null || !row.editionStatus) {
        continue;
      }

      if (!editionsById.has(row.editionId)) {
        editionsById.set(row.editionId, {
          id: row.editionId,
          label: row.editionLabel,
          status: row.editionStatus,
          year: row.editionYear,
          deadlines: []
        });
      }

      if (!row.deadlineId || !row.deadlineName || !row.deadlineKind || !row.deadlineDueAt || !row.deadlineTimezone) {
        continue;
      }

      editionsById.get(row.editionId)?.deadlines.push({
        ...buildDeadlineTrust({
          venueSlug: row.venueSlug,
          editionYear: row.editionYear,
          sourceUrl: row.sourceUrl,
          sourceKind: row.sourceKind,
          snapshotStatus: row.snapshotStatus,
          extractedJson: row.extractedJson,
          lastVerifiedAt: row.lastVerifiedAt
        }),
        id: row.deadlineId,
        name: row.deadlineName,
        kind: row.deadlineKind,
        dueAt: new Date(row.deadlineDueAt),
        timezone: row.deadlineTimezone,
        isHard: Boolean(row.deadlineIsHard),
        notes: row.deadlineNotes,
        trackName: row.trackName,
        sourceKey: row.sourceKey,
        sourceUrl: row.sourceUrl
      });
    }

    return {
      slug: firstRow.venueSlug,
      name: firstRow.venueName,
      series: firstRow.venueSeries,
      timezone: firstRow.venueTimezone,
      editions: [...editionsById.values()],
      history: historyRows.map((row) => formatDeadlineEvent(row)),
      sources: sources.map((source) => {
        const metadata = parseSnapshotMetadata(source.extractedJson);
        const parserConfig =
          overrides.entries.find((entry) => entry.venueSlug === slug && entry.sourceKey === source.key) ?? null;
        const lastVerifiedAt = fromSqliteDate(source.lastVerifiedAt ?? getFetchedAt(metadata));

        return {
          trust: getTrustSummary({
            sourceUrl: source.url,
            lastVerifiedAt,
            snapshotStatus: source.snapshotStatus,
            parsingStatus: getParsingStatus(source.snapshotStatus, metadata),
            ingestStatus: getIngestStatus(metadata),
            changeStatus: metadata?.change?.status ?? null
          }),
          change: getChangeSummary(metadata?.change?.status ?? null),
          parser: getParserSummary(parserConfig, source.snapshotStatus, metadata, Boolean(lastVerifiedAt || source.url)),
          key: source.key,
          url: source.url,
          kind: source.kind,
          isCanonical: Boolean(source.isCanonical),
          notes: source.notes,
          lastVerifiedAt,
          errorMessage: getFailureDetail(source.snapshotStatus, metadata, source.errorMessage),
          metadata
        };
      })
    };
  } finally {
    database.close();
  }
}

export async function getRecentDeadlineEvents(limit = 10) {
  const database = openDatabase();

  try {
    const rows = database
      .prepare(
        `
          SELECT
            "DeadlineEvent"."id" AS "id",
            "DeadlineEvent"."eventType" AS "eventType",
            "DeadlineEvent"."milestoneKind" AS "milestoneKind",
            "DeadlineEvent"."milestoneName" AS "milestoneName",
            "DeadlineEvent"."detectedAt" AS "detectedAt",
            "DeadlineEvent"."previousValueJson" AS "previousValueJson",
            "DeadlineEvent"."currentValueJson" AS "currentValueJson",
            "DeadlineEvent"."fieldChangesJson" AS "fieldChangesJson",
            "DeadlineEvent"."sourceKey" AS "sourceKey",
            "DeadlineEvent"."sourceKind" AS "sourceKind",
            "DeadlineEvent"."sourceUrl" AS "sourceUrl",
            "DeadlineEvent"."sourceAuthority" AS "sourceAuthority",
            "Venue"."slug" AS "venueSlug",
            "Venue"."name" AS "venueName",
            "Edition"."label" AS "editionLabel",
            "Edition"."year" AS "editionYear",
            "Track"."name" AS "trackName"
          FROM "DeadlineEvent"
          INNER JOIN "Venue" ON "Venue"."id" = "DeadlineEvent"."venueId"
          LEFT JOIN "Edition" ON "Edition"."id" = "DeadlineEvent"."editionId"
          LEFT JOIN "Track" ON "Track"."id" = "DeadlineEvent"."trackId"
          ORDER BY "DeadlineEvent"."detectedAt" DESC, "DeadlineEvent"."createdAt" DESC
          LIMIT ?
        `
      )
      .all(limit) as DeadlineEventRow[];

    return rows.map((row) => formatDeadlineEvent(row));
  } finally {
    database.close();
  }
}

export async function getMonitorHealth() {
  const database = openDatabase();

  try {
    const sourceRows = database
      .prepare(
        `
          SELECT
            "Venue"."slug" AS "venueSlug",
            "Venue"."name" AS "venueName",
            "Source"."key" AS "sourceKey",
            "Source"."url" AS "sourceUrl",
            "Source"."isCanonical" AS "isCanonical",
            "SourceSnapshot"."status" AS "snapshotStatus",
            "SourceSnapshot"."extractedJson" AS "extractedJson",
            "SourceSnapshot"."errorMessage" AS "errorMessage",
            "SourceSnapshot"."fetchedAt" AS "lastVerifiedAt"
          FROM "Source"
          INNER JOIN "Venue" ON "Venue"."id" = "Source"."venueId"
          LEFT JOIN "SourceSnapshot" ON "SourceSnapshot"."id" = (
            SELECT "LatestSnapshot"."id"
            FROM "SourceSnapshot" AS "LatestSnapshot"
            WHERE "LatestSnapshot"."sourceId" = "Source"."id"
            ORDER BY "LatestSnapshot"."fetchedAt" DESC
            LIMIT 1
          )
          ORDER BY "Venue"."name" ASC, "Source"."key" ASC
        `
      )
      .all() as Array<{
      venueSlug: string;
      venueName: string;
      sourceKey: string;
      sourceUrl: string;
      isCanonical: number;
      snapshotStatus: string | null;
      extractedJson: string | null;
      errorMessage: string | null;
      lastVerifiedAt: string | null;
    }>;
    const venueCounts = database
      .prepare(
        `
          SELECT
            "Venue"."slug" AS "slug",
            "Venue"."name" AS "name",
            COUNT(DISTINCT "Source"."id") AS "sourceCount",
            COUNT(DISTINCT "Deadline"."id") AS "deadlineCount"
          FROM "Venue"
          LEFT JOIN "Source" ON "Source"."venueId" = "Venue"."id"
          LEFT JOIN "Deadline" ON "Deadline"."venueId" = "Venue"."id"
          GROUP BY "Venue"."id"
          ORDER BY "Venue"."name" ASC
        `
      )
      .all() as VenueSummaryRow[];
    const manualOverrideRows = database
      .prepare(
        `
          SELECT
            "Venue"."slug" AS "venueSlug",
            "Venue"."name" AS "venueName",
            "Deadline"."name" AS "deadlineName"
          FROM "Deadline"
          INNER JOIN "Venue" ON "Venue"."id" = "Deadline"."venueId"
          WHERE "Deadline"."sourceSnapshotId" IS NULL
          ORDER BY "Venue"."name" ASC, "Deadline"."name" ASC
        `
      )
      .all() as Array<{
      venueSlug: string;
      venueName: string;
      deadlineName: string;
    }>;

    const queue = sourceRows.flatMap((row) => {
      const item = getQueueItemFromHealth({
        venueSlug: row.venueSlug,
        venueName: row.venueName,
        sourceKey: row.sourceKey,
        sourceUrl: row.sourceUrl,
        snapshotStatus: row.snapshotStatus,
        extractedJson: row.extractedJson,
        errorMessage: row.errorMessage,
        lastVerifiedAt: row.lastVerifiedAt
      });

      return item ? [item] : [];
    });
    const manualOverrideQueue: QueueItem[] = manualOverrideRows.map((row) => ({
      venueSlug: row.venueSlug,
      venueName: row.venueName,
      sourceKey: row.deadlineName,
      sourceUrl: `/venues/${row.venueSlug}`,
      issueType: "missing_source",
      detail: "Deadline is rendered from a manual override without a linked verified source snapshot",
      lastVerifiedAt: null,
      queue: "waiting_approval",
      tone: "warning",
      actionLabel: "Approve automation handoff"
    }));
    const queues: QueueItem[] = [...queue, ...manualOverrideQueue];
    const blockedQueue = queues.filter((item) => item.queue === "blocked");
    const atRiskQueue = queues.filter((item) => item.queue === "at_risk");
    const waitingReviewQueue = queues.filter((item) => item.queue === "waiting_review");
    const waitingApprovalQueue = queues.filter((item) => item.queue === "waiting_approval");

    const sourcesByState = sourceRows.reduce<Record<TrustState, number>>(
      (accumulator, row) => {
        const trust = buildSourceHealth({
          venueSlug: row.venueSlug,
          venueName: row.venueName,
          sourceKey: row.sourceKey,
          sourceUrl: row.sourceUrl,
          snapshotStatus: row.snapshotStatus,
          extractedJson: row.extractedJson,
          errorMessage: row.errorMessage,
          lastVerifiedAt: row.lastVerifiedAt
        }).trust;

        accumulator[trust.state] += 1;
        return accumulator;
      },
      {
        fresh: 0,
        stale: 0,
        changed: 0,
        parser_failed: 0,
        manual_override: 0,
        missing_source: 0
      }
    );
    const venues = venueCounts.map((venue) => {
      const venueSources = sourceRows.filter((row) => row.venueSlug === venue.slug);
      const healthEntries = venueSources.map((row) =>
        buildSourceHealth({
          venueSlug: row.venueSlug,
          venueName: row.venueName,
          sourceKey: row.sourceKey,
          sourceUrl: row.sourceUrl,
          snapshotStatus: row.snapshotStatus,
          extractedJson: row.extractedJson,
          errorMessage: row.errorMessage,
          lastVerifiedAt: row.lastVerifiedAt
        })
      );
      const coveredSourceCount = healthEntries.filter((entry) => entry.parser.state === "active").length;
      const monitoringSourceCount = healthEntries.filter((entry) => entry.parser.state === "monitoring_only").length;
      const blockedCount = healthEntries.filter((entry) => entry.failure && entry.failure.issueType !== "missing_parser").length;
      const changedCount = healthEntries.filter((entry) => entry.trust.state === "changed").length;
      const staleCount = healthEntries.filter((entry) => entry.trust.state === "stale").length;

      return {
        slug: venue.slug,
        name: venue.name,
        deadlineCount: venue.deadlineCount,
        sourceCount: venue.sourceCount,
        coveredSourceCount,
        monitoringSourceCount,
        freshness: getVenueFreshnessSummary({ blockedCount, changedCount, staleCount }),
        coverage: getCoverageSummary({
          deadlineCount: venue.deadlineCount,
          coveredSourceCount,
          monitoringSourceCount
        })
      };
    });

    return {
      checkedAt: new Date(),
      sourceCount: sourceRows.length,
      queue: {
        blocked: blockedQueue,
        atRisk: atRiskQueue,
        waitingReview: waitingReviewQueue,
        waitingApproval: waitingApprovalQueue
      },
      sourcesByState,
      venues,
      summary: {
        coveredVenues: venues.filter((venue) => venue.coverage.status === "covered").length,
        partialVenues: venues.filter((venue) => venue.coverage.status === "partial").length,
        monitoringOnlyVenues: venues.filter((venue) => venue.coverage.status === "monitoring_only").length,
        missingVenues: venues.filter((venue) => venue.coverage.status === "missing").length
      }
    };
  } finally {
    database.close();
  }
}
