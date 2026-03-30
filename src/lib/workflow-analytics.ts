export const workflowAnalyticsStorageKey = "workflow-analytics-v1";
const workflowSessionStorageKey = "workflow-analytics-session-id-v1";
const workflowAnalyticsEventName = "workflow-analytics-updated";
const sessionTimeoutMs = 30 * 60 * 1000;
const maxStoredEvents = 400;

export type WorkflowEventName =
  | "workspace_opened"
  | "filters_changed"
  | "saved_view_created"
  | "saved_view_applied"
  | "saved_view_deleted"
  | "export_downloaded"
  | "feed_link_copied"
  | "change_feed_opened"
  | "compare_link_opened"
  | "venue_history_opened";

export type WorkflowEvent = {
  id: string;
  name: WorkflowEventName;
  occurredAt: string;
  pathname: string;
  sessionId: string;
  metadata?: Record<string, number | string | boolean | null>;
};

export type WorkflowAnalyticsState = {
  version: 1;
  installId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sessions: Array<{
    id: string;
    startedAt: string;
    lastSeenAt: string;
  }>;
  events: WorkflowEvent[];
};

export type WorkflowAdoptionSummary = {
  trackedSessions: number;
  returnVisits: number;
  sessionsWithFiltering: number;
  savedViewCount: number;
  sessionsWithSavedViews: number;
  searchToSaveConversion: number | null;
  alertConfiguredCount: number;
  compareLaunchCount: number;
  venueHistoryOpenCount: number;
  changeFeedOpenCount: number;
  exportDownloadCount: number;
  feedLinkCopyCount: number;
  manualTrackingSignals: number;
  replacementState: {
    label: string;
    tone: "critical" | "warning" | "attention" | "positive";
    detail: string;
  };
  exportReadiness: {
    label: string;
    detail: string;
  };
  latestActivityAt: string | null;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readState(): WorkflowAnalyticsState {
  if (!isBrowser()) {
    throw new Error("Workflow analytics are only available in the browser");
  }

  try {
    const raw = window.localStorage.getItem(workflowAnalyticsStorageKey);

    if (!raw) {
      throw new Error("Missing analytics state");
    }

    const parsed = JSON.parse(raw) as WorkflowAnalyticsState;

    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.events)) {
      throw new Error("Invalid analytics state");
    }

    return parsed;
  } catch {
    const now = new Date().toISOString();
    const state: WorkflowAnalyticsState = {
      version: 1,
      installId: createId(),
      firstSeenAt: now,
      lastSeenAt: now,
      sessions: [],
      events: []
    };

    window.localStorage.setItem(workflowAnalyticsStorageKey, JSON.stringify(state));
    return state;
  }
}

function writeState(state: WorkflowAnalyticsState) {
  window.localStorage.setItem(workflowAnalyticsStorageKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(workflowAnalyticsEventName));
}

function ensureSession(state: WorkflowAnalyticsState) {
  const now = new Date().toISOString();
  const lastSeenAt = Date.parse(state.lastSeenAt);
  const sessionIsFresh = Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt < sessionTimeoutMs;
  let sessionId = window.sessionStorage.getItem(workflowSessionStorageKey);

  if (!sessionId || !sessionIsFresh) {
    sessionId = createId();
    window.sessionStorage.setItem(workflowSessionStorageKey, sessionId);
  }

  const existingSession = state.sessions.find((session) => session.id === sessionId);

  if (existingSession) {
    existingSession.lastSeenAt = now;
  } else {
    state.sessions.push({
      id: sessionId,
      startedAt: now,
      lastSeenAt: now
    });
  }

  state.lastSeenAt = now;
  return sessionId;
}

export function recordWorkflowEvent(
  name: WorkflowEventName,
  pathname: string,
  metadata?: Record<string, number | string | boolean | null>
) {
  if (!isBrowser()) {
    return;
  }

  const state = readState();
  const sessionId = ensureSession(state);

  state.events.push({
    id: createId(),
    name,
    occurredAt: new Date().toISOString(),
    pathname,
    sessionId,
    metadata
  });
  state.events = state.events.slice(-maxStoredEvents);
  writeState(state);
}

export function summarizeWorkflowAnalytics(state: WorkflowAnalyticsState): WorkflowAdoptionSummary {
  const sessionsWithFiltering = new Set(
    state.events.filter((event) => event.name === "filters_changed").map((event) => event.sessionId)
  );
  const sessionsWithSavedViews = new Set(
    state.events.filter((event) => event.name === "saved_view_created").map((event) => event.sessionId)
  );
  const savedViewEvents = state.events.filter((event) => event.name === "saved_view_created");
  const compareLaunchCount = state.events.filter((event) => event.name === "compare_link_opened").length;
  const venueHistoryOpenCount = state.events.filter((event) => event.name === "venue_history_opened").length;
  const changeFeedOpenCount = state.events.filter((event) => event.name === "change_feed_opened").length;
  const exportDownloadCount = state.events.filter((event) => event.name === "export_downloaded").length;
  const feedLinkCopyCount = state.events.filter((event) => event.name === "feed_link_copied").length;
  const alertConfiguredCount = savedViewEvents.filter(
    (event) => typeof event.metadata?.notificationWindowDays === "number"
  ).length;
  const searchToSaveConversion =
    sessionsWithFiltering.size > 0 ? sessionsWithSavedViews.size / sessionsWithFiltering.size : null;
  const returnVisits = Math.max(state.sessions.length - 1, 0);
  const manualTrackingSignals =
    savedViewEvents.length + compareLaunchCount + venueHistoryOpenCount + changeFeedOpenCount + exportDownloadCount;

  let replacementState: WorkflowAdoptionSummary["replacementState"];

  if (savedViewEvents.length >= 3 && returnVisits >= 2 && manualTrackingSignals >= 8) {
    replacementState = {
      label: "Replacing manual tracking",
      tone: "positive",
      detail: "Researchers are returning, saving recurring slices, and reopening venue history from inside the product."
    };
  } else if (savedViewEvents.length >= 1 && manualTrackingSignals >= 3) {
    replacementState = {
      label: "Adoption emerging",
      tone: "attention",
      detail: "The workflow is being used end-to-end, but the repeat-return pattern is still early."
    };
  } else {
    replacementState = {
      label: "Manual tracking still dominant",
      tone: "warning",
      detail: "Discovery is visible, but there is not enough repeat saved-view behavior yet to claim spreadsheet replacement."
    };
  }

  const latestActivityAt =
    state.events.length > 0 ? state.events[state.events.length - 1]?.occurredAt ?? state.lastSeenAt : state.lastSeenAt;

  return {
    trackedSessions: state.sessions.length,
    returnVisits,
    sessionsWithFiltering: sessionsWithFiltering.size,
    savedViewCount: savedViewEvents.length,
    sessionsWithSavedViews: sessionsWithSavedViews.size,
    searchToSaveConversion,
    alertConfiguredCount,
    compareLaunchCount,
    venueHistoryOpenCount,
    changeFeedOpenCount,
    exportDownloadCount,
    feedLinkCopyCount,
    manualTrackingSignals,
    replacementState,
    exportReadiness: {
      label: exportDownloadCount + feedLinkCopyCount > 0 ? "Export flows active" : "Export flows live",
      detail:
        exportDownloadCount + feedLinkCopyCount > 0
          ? `${exportDownloadCount} export downloads and ${feedLinkCopyCount} calendar-feed copies were recorded in this browser.`
          : "ICS, feed-copy, and machine-readable exports are available; usage will register once a researcher exports a scoped slice."
    },
    latestActivityAt
  };
}

export function readWorkflowAnalyticsSummary() {
  if (!isBrowser()) {
    return null;
  }

  return summarizeWorkflowAnalytics(readState());
}

export function subscribeToWorkflowAnalytics(callback: () => void) {
  if (!isBrowser()) {
    return () => {};
  }

  const listener = () => callback();
  window.addEventListener(workflowAnalyticsEventName, listener);

  return () => window.removeEventListener(workflowAnalyticsEventName, listener);
}
