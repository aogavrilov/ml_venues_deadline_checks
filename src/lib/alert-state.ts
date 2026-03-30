import type { DeadlineBrowseEntry, DeadlineEventFeedItem } from "@/lib/deadlines";

export type SortMode = "soonest" | "latest" | "venue_az" | "field" | "trust";
export type WatchlistMode = "venue_cluster" | "topic_group" | "deadline_window" | "mixed";

export type AlertFilters = {
  query: string;
  field: string;
  geography: string;
  month: string;
  deadlineType: string;
  status: string;
  sourceType: string;
  sort: SortMode;
};

export type SavedView = {
  id: string;
  name: string;
  filters: AlertFilters;
  watchlistMode: WatchlistMode;
  notificationWindowDays: number;
  createdAt: string;
  alertsEnabled: boolean;
  deliveryChannel: "in_app";
};

export type AlertReason = "changed_deadline" | "new_cfp" | "upcoming_deadline";
export type AlertDeliveryStatus = "queued" | "delivered" | "acknowledged" | "failed" | "retrying";
export type AlertSubscriptionStatus = "active" | "paused" | "needs_attention";

export type AlertRecord = {
  id: string;
  dedupeKey: string;
  subscriptionId: string;
  subscriptionName: string;
  deliveryChannel: "in_app";
  reason: AlertReason;
  status: AlertDeliveryStatus;
  title: string;
  detail: string;
  venueSlug: string;
  venueName: string;
  milestoneName: string;
  milestoneKind: string;
  editionLabel: string | null;
  trackName: string | null;
  dueAt: string | null;
  detectedAt: string;
  sourceLabel: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  attempts: number;
  lastError: string | null;
};

export type AlertSubscriptionHealth = {
  subscriptionId: string;
  subscriptionName: string;
  status: AlertSubscriptionStatus;
  deliveryChannel: "in_app";
  alertsEnabled: boolean;
  notificationWindowDays: number;
  watchlistMode: WatchlistMode;
  lastEvaluatedAt: string | null;
  lastDeliveredAt: string | null;
  lastErrorAt: string | null;
  queuedCount: number;
  deliveredCount: number;
  acknowledgedCount: number;
  failedCount: number;
};

export type AlertState = {
  version: 1;
  generatedAt: string;
  records: AlertRecord[];
  subscriptions: AlertSubscriptionHealth[];
};

type AlertCandidate = {
  dedupeKey: string;
  subscriptionId: string;
  subscriptionName: string;
  deliveryChannel: "in_app";
  reason: AlertReason;
  title: string;
  detail: string;
  venueSlug: string;
  venueName: string;
  milestoneName: string;
  milestoneKind: string;
  editionLabel: string | null;
  trackName: string | null;
  dueAt: string | null;
  detectedAt: string;
  sourceLabel: string;
};

export const savedViewsStorageKey = "deadline-browser-saved-views-v1";
export const alertStateStorageKey = "deadline-alert-state-v1";

const defaultFilters: AlertFilters = {
  query: "",
  field: "",
  geography: "",
  month: "",
  deadlineType: "",
  status: "",
  sourceType: "",
  sort: "soonest"
};

const newCfpKinds = new Set(["abstract_submission", "paper_submission"]);

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isSortMode(value: string): value is SortMode {
  return value === "soonest" || value === "latest" || value === "venue_az" || value === "field" || value === "trust";
}

function isWatchlistMode(value: string): value is WatchlistMode {
  return value === "venue_cluster" || value === "topic_group" || value === "deadline_window" || value === "mixed";
}

export function hydrateSavedView(raw: unknown): SavedView | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<SavedView> & { filters?: Partial<AlertFilters> };
  const id = asString(candidate.id);
  const name = asString(candidate.name);
  const createdAt = asString(candidate.createdAt);

  if (!id || !name || !createdAt) {
    return null;
  }

  const filters =
    candidate.filters && typeof candidate.filters === "object" ? (candidate.filters as Partial<AlertFilters>) : {};
  const sort = asString(filters.sort, defaultFilters.sort);
  const watchlistMode = asString(candidate.watchlistMode, "mixed");

  return {
    id,
    name,
    createdAt,
    filters: {
      query: asString(filters.query),
      field: asString(filters.field),
      geography: asString(filters.geography),
      month: asString(filters.month),
      deadlineType: asString(filters.deadlineType),
      status: asString(filters.status),
      sourceType: asString(filters.sourceType),
      sort: isSortMode(sort) ? sort : "soonest"
    },
    watchlistMode: isWatchlistMode(watchlistMode) ? watchlistMode : "mixed",
    notificationWindowDays: asNumber(candidate.notificationWindowDays, 30),
    alertsEnabled: asBoolean(candidate.alertsEnabled, true),
    deliveryChannel: "in_app"
  };
}

export function hydrateSavedViews(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry) => hydrateSavedView(entry)).filter((entry): entry is SavedView => entry !== null);
}

export function createSavedView(input: Omit<SavedView, "alertsEnabled" | "deliveryChannel">): SavedView {
  return {
    ...input,
    alertsEnabled: true,
    deliveryChannel: "in_app"
  };
}

function matchesQueryText(deadline: DeadlineBrowseEntry, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    deadline.name,
    deadline.venueName,
    deadline.venueAreaLabel,
    deadline.geographyLabel,
    deadline.editionLabel,
    deadline.trackName ?? "",
    deadline.kindLabel,
    deadline.statusLabel,
    deadline.sourceLabel ?? "",
    deadline.parserLabel
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function matchesFilters(deadline: DeadlineBrowseEntry, filters: AlertFilters) {
  if (!matchesQueryText(deadline, filters.query)) return false;
  if (filters.field && deadline.venueArea !== filters.field) return false;
  if (filters.geography && deadline.geography !== filters.geography) return false;
  if (filters.month && deadline.month !== filters.month) return false;
  if (filters.deadlineType && deadline.kind !== filters.deadlineType) return false;
  if (filters.status && deadline.status !== filters.status) return false;
  if (filters.sourceType && deadline.sourceType !== filters.sourceType) return false;

  return true;
}

function titleCase(value: string) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatEventSource(event: DeadlineEventFeedItem) {
  return `${event.sourceAuthority} via ${event.sourceKey}`;
}

function getEventReason(event: DeadlineEventFeedItem): AlertReason {
  return event.eventType === "deadline_added" && newCfpKinds.has(event.milestoneKind) ? "new_cfp" : "changed_deadline";
}

function buildUpcomingCandidates(
  view: SavedView,
  matchingDeadlines: DeadlineBrowseEntry[],
  now: number,
  nowIso: string
) {
  const upperBound = now + view.notificationWindowDays * 24 * 60 * 60 * 1000;

  return matchingDeadlines.flatMap((deadline) => {
    const dueAt = new Date(deadline.dueAt).getTime();

    if (dueAt < now || dueAt > upperBound) {
      return [];
    }

    return [
      {
        dedupeKey: `${view.id}:upcoming:${deadline.id}`,
        subscriptionId: view.id,
        subscriptionName: view.name,
        deliveryChannel: view.deliveryChannel,
        reason: "upcoming_deadline" as const,
        title: `${deadline.venueName} enters the ${view.notificationWindowDays}-day window`,
        detail: `${deadline.name} is due soon inside ${view.name}.`,
        venueSlug: deadline.venueSlug,
        venueName: deadline.venueName,
        milestoneName: deadline.name,
        milestoneKind: deadline.kind,
        editionLabel: deadline.editionLabel,
        trackName: deadline.trackName,
        dueAt: deadline.dueAt,
        detectedAt: nowIso,
        sourceLabel: deadline.sourceLabel ?? deadline.sourceTypeLabel
      } satisfies AlertCandidate
    ];
  });
}

function buildEventCandidates(
  view: SavedView,
  matchingDeadlines: DeadlineBrowseEntry[],
  allDeadlines: DeadlineBrowseEntry[],
  events: DeadlineEventFeedItem[]
) {
  const matchingDeadlineIds = new Set(matchingDeadlines.map((deadline) => deadline.id));
  const matchingVenueSlugs = new Set(matchingDeadlines.map((deadline) => deadline.venueSlug));

  return events.flatMap((event) => {
    const relatedDeadline =
      allDeadlines.find((deadline) => deadline.venueSlug === event.venueSlug && deadline.kind === event.milestoneKind) ??
      allDeadlines.find((deadline) => deadline.venueSlug === event.venueSlug);

    const matchesDirectDeadline = relatedDeadline ? matchingDeadlineIds.has(relatedDeadline.id) : false;
    const matchesVenueScope = matchingVenueSlugs.has(event.venueSlug);
    const filtersAllowRemovedMilestone =
      event.eventType === "deadline_removed" && matchesVenueScope && (!view.filters.deadlineType || view.filters.deadlineType === event.milestoneKind);

    if (!matchesDirectDeadline && !filtersAllowRemovedMilestone) {
      return [];
    }

    const reason = getEventReason(event);

    return [
      {
        dedupeKey: `${view.id}:event:${event.id}`,
        subscriptionId: view.id,
        subscriptionName: view.name,
        deliveryChannel: view.deliveryChannel,
        reason,
        title:
          reason === "new_cfp"
            ? `${event.venueName} opened a tracked CFP milestone`
            : `${event.venueName} changed a tracked deadline`,
        detail: event.summary.detail,
        venueSlug: event.venueSlug,
        venueName: event.venueName,
        milestoneName: event.milestoneName,
        milestoneKind: event.milestoneKind,
        editionLabel: event.editionLabel,
        trackName: event.trackName,
        dueAt: event.currentValue?.dueAt ?? event.previousValue?.dueAt ?? null,
        detectedAt: event.detectedAt,
        sourceLabel: formatEventSource(event)
      } satisfies AlertCandidate
    ];
  });
}

function createRecord(candidate: AlertCandidate, timestamp: string): AlertRecord {
  return {
    id: candidate.dedupeKey,
    dedupeKey: candidate.dedupeKey,
    subscriptionId: candidate.subscriptionId,
    subscriptionName: candidate.subscriptionName,
    deliveryChannel: candidate.deliveryChannel,
    reason: candidate.reason,
    status: "queued",
    title: candidate.title,
    detail: candidate.detail,
    venueSlug: candidate.venueSlug,
    venueName: candidate.venueName,
    milestoneName: candidate.milestoneName,
    milestoneKind: candidate.milestoneKind,
    editionLabel: candidate.editionLabel,
    trackName: candidate.trackName,
    dueAt: candidate.dueAt,
    detectedAt: candidate.detectedAt,
    sourceLabel: candidate.sourceLabel,
    createdAt: timestamp,
    updatedAt: timestamp,
    deliveredAt: null,
    acknowledgedAt: null,
    attempts: 0,
    lastError: null
  };
}

function createSubscriptionHealth(view: SavedView, records: AlertRecord[], evaluatedAt: string): AlertSubscriptionHealth {
  const lastDeliveredAt =
    records
      .map((record) => record.deliveredAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const lastErrorAt =
    records
      .filter((record) => record.status === "failed")
      .map((record) => record.updatedAt)
      .sort()
      .at(-1) ?? null;

  return {
    subscriptionId: view.id,
    subscriptionName: view.name,
    status: !view.alertsEnabled
      ? "paused"
      : records.some((record) => record.status === "failed")
        ? "needs_attention"
        : "active",
    deliveryChannel: view.deliveryChannel,
    alertsEnabled: view.alertsEnabled,
    notificationWindowDays: view.notificationWindowDays,
    watchlistMode: view.watchlistMode,
    lastEvaluatedAt: evaluatedAt,
    lastDeliveredAt,
    lastErrorAt,
    queuedCount: records.filter((record) => record.status === "queued" || record.status === "retrying").length,
    deliveredCount: records.filter((record) => record.status === "delivered").length,
    acknowledgedCount: records.filter((record) => record.status === "acknowledged").length,
    failedCount: records.filter((record) => record.status === "failed").length
  };
}

function rebuildSubscriptionHealth(savedViews: SavedView[], records: AlertRecord[], evaluatedAt: string) {
  return savedViews.map((view) =>
    createSubscriptionHealth(
      view,
      records
        .filter((record) => record.subscriptionId === view.id)
        .sort((left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime()),
      evaluatedAt
    )
  );
}

export function createEmptyAlertState(nowIso: string): AlertState {
  return {
    version: 1,
    generatedAt: nowIso,
    records: [],
    subscriptions: []
  };
}

export function hydrateAlertState(raw: unknown, nowIso: string): AlertState {
  if (!raw || typeof raw !== "object") {
    return createEmptyAlertState(nowIso);
  }

  const candidate = raw as Partial<AlertState>;

  return {
    version: 1,
    generatedAt: asString(candidate.generatedAt, nowIso),
    records: Array.isArray(candidate.records) ? (candidate.records as AlertRecord[]) : [],
    subscriptions: Array.isArray(candidate.subscriptions) ? (candidate.subscriptions as AlertSubscriptionHealth[]) : []
  };
}

export function syncAlertState(params: {
  savedViews: SavedView[];
  previousState: AlertState;
  deadlines: DeadlineBrowseEntry[];
  events: DeadlineEventFeedItem[];
  now: Date;
}) {
  const nowIso = params.now.toISOString();
  const existingRecords = new Map(params.previousState.records.map((record) => [record.dedupeKey, record]));
  const activeSubscriptionIds = new Set(params.savedViews.map((view) => view.id));
  const nextRecords: AlertRecord[] = params.previousState.records.filter((record) => activeSubscriptionIds.has(record.subscriptionId));

  const knownDedupeKeys = new Set(nextRecords.map((record) => record.dedupeKey));

  for (const view of params.savedViews) {
    if (!view.alertsEnabled) {
      continue;
    }

    const matchingDeadlines = params.deadlines.filter((deadline) => matchesFilters(deadline, view.filters));
    const candidates = [
      ...buildUpcomingCandidates(view, matchingDeadlines, params.now.getTime(), nowIso),
      ...buildEventCandidates(view, matchingDeadlines, params.deadlines, params.events)
    ];

    for (const candidate of candidates) {
      const existing = existingRecords.get(candidate.dedupeKey);

      if (existing) {
        continue;
      }

      if (knownDedupeKeys.has(candidate.dedupeKey)) {
        continue;
      }

      nextRecords.push(createRecord(candidate, nowIso));
      knownDedupeKeys.add(candidate.dedupeKey);
    }
  }

  return {
    version: 1 as const,
    generatedAt: nowIso,
    records: nextRecords.sort((left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime()),
    subscriptions: rebuildSubscriptionHealth(params.savedViews, nextRecords, nowIso)
  };
}

export function deliverQueuedAlerts(state: AlertState, now: Date) {
  const nowIso = now.toISOString();
  const nextRecords = state.records.map((record) => {
    if (record.status !== "queued" && record.status !== "retrying") {
      return record;
    }

    try {
      return {
        ...record,
        status: "delivered" as const,
        attempts: record.attempts + 1,
        deliveredAt: nowIso,
        updatedAt: nowIso,
        lastError: null
      };
    } catch (error) {
      return {
        ...record,
        status: "failed" as const,
        attempts: record.attempts + 1,
        updatedAt: nowIso,
        lastError: error instanceof Error ? error.message : "Unknown alert delivery error"
      };
    }
  });

  return {
    ...state,
    generatedAt: nowIso,
    records: nextRecords,
    subscriptions: rebuildSubscriptionHealth(
      state.subscriptions.map((subscription) => ({
        id: subscription.subscriptionId,
        name: subscription.subscriptionName,
        watchlistMode: subscription.watchlistMode,
        notificationWindowDays: subscription.notificationWindowDays,
        alertsEnabled: subscription.alertsEnabled,
        createdAt: nowIso,
        filters: defaultFilters,
        deliveryChannel: subscription.deliveryChannel
      })),
      nextRecords,
      nowIso
    )
  };
}

export function acknowledgeAlert(state: AlertState, recordId: string, now: Date) {
  const nowIso = now.toISOString();
  const nextRecords = state.records.map((record) =>
    record.id === recordId
      ? {
          ...record,
          status: "acknowledged" as const,
          acknowledgedAt: nowIso,
          updatedAt: nowIso
        }
      : record
  );

  return {
    ...state,
    generatedAt: nowIso,
    records: nextRecords,
    subscriptions: rebuildSubscriptionHealth(
      state.subscriptions.map((subscription) => ({
        id: subscription.subscriptionId,
        name: subscription.subscriptionName,
        watchlistMode: subscription.watchlistMode,
        notificationWindowDays: subscription.notificationWindowDays,
        alertsEnabled: subscription.alertsEnabled,
        createdAt: nowIso,
        filters: defaultFilters,
        deliveryChannel: subscription.deliveryChannel
      })),
      nextRecords,
      nowIso
    )
  };
}

export function retryAlert(state: AlertState, recordId: string, now: Date) {
  const nowIso = now.toISOString();
  const nextRecords = state.records.map((record) =>
    record.id === recordId
      ? {
          ...record,
          status: "retrying" as const,
          updatedAt: nowIso
        }
      : record
  );

  return {
    ...state,
    generatedAt: nowIso,
    records: nextRecords,
    subscriptions: rebuildSubscriptionHealth(
      state.subscriptions.map((subscription) => ({
        id: subscription.subscriptionId,
        name: subscription.subscriptionName,
        watchlistMode: subscription.watchlistMode,
        notificationWindowDays: subscription.notificationWindowDays,
        alertsEnabled: subscription.alertsEnabled,
        createdAt: nowIso,
        filters: defaultFilters,
        deliveryChannel: subscription.deliveryChannel
      })),
      nextRecords,
      nowIso
    )
  };
}

export function getAlertReasonLabel(reason: AlertReason) {
  switch (reason) {
    case "new_cfp":
      return "New CFP";
    case "upcoming_deadline":
      return "Due soon";
    default:
      return "Changed";
  }
}

export function getSubscriptionStatusLabel(status: AlertSubscriptionStatus) {
  switch (status) {
    case "paused":
      return "Paused";
    case "needs_attention":
      return "Needs attention";
    default:
      return "Active";
  }
}

export function getSubscriptionStatusTone(status: AlertSubscriptionStatus) {
  switch (status) {
    case "paused":
      return "neutral";
    case "needs_attention":
      return "warning";
    default:
      return "positive";
  }
}

export function getDeliveryStatusLabel(status: AlertDeliveryStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "retrying":
      return "Retrying";
    case "acknowledged":
      return "Acknowledged";
    case "failed":
      return "Failed";
    default:
      return "Delivered";
  }
}

export function getDeliveryStatusTone(status: AlertDeliveryStatus) {
  switch (status) {
    case "failed":
      return "critical";
    case "queued":
    case "retrying":
      return "attention";
    case "acknowledged":
      return "neutral";
    default:
      return "positive";
  }
}

export function describeAlertRecord(record: AlertRecord) {
  const deadlineLabel = record.dueAt ? new Date(record.dueAt).toISOString() : null;

  switch (record.reason) {
    case "new_cfp":
      return `${record.milestoneName} was newly published for ${record.venueName}${deadlineLabel ? ` (${deadlineLabel})` : ""}.`;
    case "upcoming_deadline":
      return `${record.milestoneName} is inside the configured notification window for ${record.subscriptionName}.`;
    default:
      return record.detail;
  }
}

export function summarizeAlertState(state: AlertState) {
  return {
    activeSubscriptions: state.subscriptions.filter((subscription) => subscription.status === "active").length,
    pausedSubscriptions: state.subscriptions.filter((subscription) => subscription.status === "paused").length,
    needsAttentionSubscriptions: state.subscriptions.filter((subscription) => subscription.status === "needs_attention").length,
    queuedDeliveries: state.records.filter((record) => record.status === "queued" || record.status === "retrying").length,
    deliveredAlerts: state.records.filter((record) => record.status === "delivered").length,
    acknowledgedAlerts: state.records.filter((record) => record.status === "acknowledged").length,
    failedDeliveries: state.records.filter((record) => record.status === "failed").length
  };
}

export function getDefaultFilters() {
  return defaultFilters;
}

export function getSuggestedAlertTitle(kind: string) {
  return titleCase(kind);
}
