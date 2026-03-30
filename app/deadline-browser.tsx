"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { DeadlineBrowseDataset, DeadlineBrowseEntry, DeadlineEventFeedItem } from "@/lib/deadlines";
import {
  acknowledgeAlert,
  alertStateStorageKey,
  createEmptyAlertState,
  createSavedView,
  deliverQueuedAlerts,
  describeAlertRecord,
  getAlertReasonLabel,
  getDefaultFilters,
  getDeliveryStatusLabel,
  getDeliveryStatusTone,
  getSubscriptionStatusLabel,
  getSubscriptionStatusTone,
  hydrateAlertState,
  hydrateSavedViews,
  retryAlert,
  savedViewsStorageKey,
  summarizeAlertState,
  syncAlertState,
  type AlertState,
  type AlertFilters as Filters,
  type SavedView,
  type SortMode,
  type WatchlistMode
} from "@/lib/alert-state";
import {
  buildCalendarFeedUrl,
  buildCsvExport,
  buildIcsCalendar,
  buildJsonExport,
  downloadTextFile
} from "@/lib/export-formats";
import { recordWorkflowEvent } from "@/lib/workflow-analytics";

type DeadlineBrowserProps = {
  data: DeadlineBrowseDataset;
  recentEvents: DeadlineEventFeedItem[];
};

type CompareOption = {
  key: string;
  label: string;
  editionLabel: string;
  milestones: DeadlineBrowseEntry[];
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "soonest", label: "Soonest first" },
  { value: "latest", label: "Latest first" },
  { value: "venue_az", label: "Venue A-Z" },
  { value: "field", label: "Field clusters" },
  { value: "trust", label: "Best trust first" }
];

const watchlistModeOptions: Array<{ value: WatchlistMode; label: string }> = [
  { value: "venue_cluster", label: "Venue cluster" },
  { value: "topic_group", label: "Topic grouping" },
  { value: "deadline_window", label: "Deadline window" },
  { value: "mixed", label: "Mixed workflow" }
];

const notificationWindowOptions = [14, 30, 60, 90];

const statusRank: Record<string, number> = {
  fresh: 0,
  changed: 1,
  stale: 2,
  manual_override: 3,
  missing_source: 4,
  parser_failed: 5
};

const savedViewPresets: Array<{ label: string; params: Partial<Filters> }> = [
  {
    label: "Paper deadlines",
    params: { deadlineType: "paper_submission", sort: "soonest" }
  },
  {
    label: "Needs review",
    params: { status: "changed", sort: "trust" }
  },
  {
    label: "NLP sweep",
    params: { field: "nlp", sort: "soonest" }
  }
];

const defaultFilters: Filters = getDefaultFilters();

function titleCase(value: string) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function readFilters(searchParams: URLSearchParams): Filters {
  const sort = searchParams.get("sort");

  return {
    query: searchParams.get("q") ?? "",
    field: searchParams.get("field") ?? "",
    geography: searchParams.get("geo") ?? "",
    month: searchParams.get("month") ?? "",
    deadlineType: searchParams.get("type") ?? "",
    status: searchParams.get("status") ?? "",
    sourceType: searchParams.get("source") ?? "",
    sort:
      sort === "latest" || sort === "venue_az" || sort === "field" || sort === "trust" ? sort : "soonest"
  };
}

function buildQueryString(filters: Filters) {
  const params = new URLSearchParams();

  if (filters.query) params.set("q", filters.query);
  if (filters.field) params.set("field", filters.field);
  if (filters.geography) params.set("geo", filters.geography);
  if (filters.month) params.set("month", filters.month);
  if (filters.deadlineType) params.set("type", filters.deadlineType);
  if (filters.status) params.set("status", filters.status);
  if (filters.sourceType) params.set("source", filters.sourceType);
  if (filters.sort !== "soonest") params.set("sort", filters.sort);

  return params.toString();
}

function matchesQuery(entry: DeadlineBrowseEntry, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    entry.name,
    entry.venueName,
    entry.venueAreaLabel,
    entry.geographyLabel,
    entry.editionLabel,
    entry.trackName ?? "",
    entry.kindLabel,
    entry.statusLabel,
    entry.sourceLabel ?? "",
    entry.parserLabel
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function sortEntries(entries: DeadlineBrowseEntry[], mode: SortMode) {
  return [...entries].sort((left, right) => {
    if (mode === "latest") {
      return new Date(right.dueAt).getTime() - new Date(left.dueAt).getTime();
    }

    if (mode === "venue_az") {
      return (
        left.venueName.localeCompare(right.venueName) ||
        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
      );
    }

    if (mode === "field") {
      return (
        left.venueAreaLabel.localeCompare(right.venueAreaLabel) ||
        left.venueName.localeCompare(right.venueName) ||
        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
      );
    }

    if (mode === "trust") {
      return (
        (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99) ||
        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
      );
    }

    return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
  });
}

function getDefaultWatchlistMode(filters: Filters, visibleVenueCount: number): WatchlistMode {
  if (filters.field) {
    return "topic_group";
  }

  if (filters.month || filters.deadlineType) {
    return "deadline_window";
  }

  if (visibleVenueCount > 0 && visibleVenueCount <= 4) {
    return "venue_cluster";
  }

  return "mixed";
}

function getWatchlistModeLabel(mode: WatchlistMode) {
  return watchlistModeOptions.find((option) => option.value === mode)?.label ?? "Mixed workflow";
}

function getFacetLabel(
  facets: Array<{ value: string; label: string; count: number }>,
  value: string,
  fallback: string
) {
  return facets.find((facet) => facet.value === value)?.label ?? fallback;
}

function summarizeFilters(filters: Filters, data: DeadlineBrowseDataset) {
  const parts: string[] = [];

  if (filters.query) {
    parts.push(`Search "${filters.query}"`);
  }

  if (filters.field) {
    parts.push(getFacetLabel(data.facets.fields, filters.field, filters.field));
  }

  if (filters.geography) {
    parts.push(getFacetLabel(data.facets.geographies, filters.geography, filters.geography));
  }

  if (filters.month) {
    parts.push(getFacetLabel(data.facets.months, filters.month, filters.month));
  }

  if (filters.deadlineType) {
    parts.push(getFacetLabel(data.facets.deadlineTypes, filters.deadlineType, filters.deadlineType));
  }

  if (filters.status) {
    parts.push(getFacetLabel(data.facets.statuses, filters.status, filters.status));
  }

  if (filters.sourceType) {
    parts.push(getFacetLabel(data.facets.sourceTypes, filters.sourceType, filters.sourceType));
  }

  if (filters.sort !== "soonest") {
    parts.push(sortOptions.find((option) => option.value === filters.sort)?.label ?? filters.sort);
  }

  return parts.length > 0 ? parts : ["All imported milestones"];
}

function getSuggestedViewName(filters: Filters, data: DeadlineBrowseDataset, visibleVenueCount: number) {
  if (filters.query) {
    return filters.query;
  }

  if (filters.field) {
    return `${getFacetLabel(data.facets.fields, filters.field, filters.field)} watchlist`;
  }

  if (filters.month) {
    return `${getFacetLabel(data.facets.months, filters.month, filters.month)} window`;
  }

  if (filters.deadlineType) {
    return `${getFacetLabel(data.facets.deadlineTypes, filters.deadlineType, filters.deadlineType)} watchlist`;
  }

  if (visibleVenueCount > 0 && visibleVenueCount <= 4) {
    return "Venue shortlist";
  }

  return "Research watchlist";
}

function filterDeadlines(entries: DeadlineBrowseEntry[], filters: Filters) {
  return sortEntries(
    entries.filter((entry) => {
      if (!matchesQuery(entry, filters.query)) return false;
      if (filters.field && entry.venueArea !== filters.field) return false;
      if (filters.geography && entry.geography !== filters.geography) return false;
      if (filters.month && entry.month !== filters.month) return false;
      if (filters.deadlineType && entry.kind !== filters.deadlineType) return false;
      if (filters.status && entry.status !== filters.status) return false;
      if (filters.sourceType && entry.sourceType !== filters.sourceType) return false;
      return true;
    }),
    filters.sort
  );
}

function getUpcomingCount(entries: DeadlineBrowseEntry[], windowDays: number) {
  const now = Date.now();
  const upperBound = now + windowDays * 24 * 60 * 60 * 1000;

  return entries.filter((entry) => {
    const dueAt = new Date(entry.dueAt).getTime();
    return dueAt >= now && dueAt <= upperBound;
  }).length;
}

function getCompareKey(entry: DeadlineBrowseEntry) {
  return `${entry.venueSlug}::${entry.trackName ?? "all"}::${entry.editionYear}`;
}

function getCompareLabel(entry: DeadlineBrowseEntry) {
  return entry.trackName ? `${entry.venueName} · ${entry.trackName}` : entry.venueName;
}

function buildCompareOptions(entries: DeadlineBrowseEntry[]) {
  const options = new Map<string, CompareOption>();

  for (const entry of entries) {
    const key = getCompareKey(entry);
    const existing = options.get(key);

    if (existing) {
      existing.milestones.push(entry);
      continue;
    }

    options.set(key, {
      key,
      label: getCompareLabel(entry),
      editionLabel: entry.editionLabel,
      milestones: [entry]
    });
  }

  return [...options.values()].map((option) => ({
    ...option,
    milestones: [...option.milestones].sort(
      (left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
    )
  }));
}

function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readStoredViews() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(savedViewsStorageKey);
    if (!raw) {
      return [];
    }

    return hydrateSavedViews(JSON.parse(raw));
  } catch {
    return [];
  }
}

function readStoredAlertState() {
  if (typeof window === "undefined") {
    return createEmptyAlertState(new Date().toISOString());
  }

  try {
    const raw = window.localStorage.getItem(alertStateStorageKey);
    if (!raw) {
      return createEmptyAlertState(new Date().toISOString());
    }

    return hydrateAlertState(JSON.parse(raw), new Date().toISOString());
  } catch {
    return createEmptyAlertState(new Date().toISOString());
  }
}

function PresetLink({
  label,
  params,
  pathname
}: {
  label: string;
  params: Partial<Filters>;
  pathname: string;
}) {
  const filters: Filters = {
    ...defaultFilters,
    ...params
  };
  const queryString = buildQueryString(filters);

  return (
    <a className="facet-pill" href={queryString ? `${pathname}?${queryString}` : pathname}>
      {label}
    </a>
  );
}

export function DeadlineBrowser({ data, recentEvents }: DeadlineBrowserProps) {
  const pathname = usePathname();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveName, setSaveName] = useState("");
  const [watchlistMode, setWatchlistMode] = useState<WatchlistMode>("mixed");
  const [notificationWindowDays, setNotificationWindowDays] = useState(30);
  const [compareKeys, setCompareKeys] = useState<string[]>([]);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<AlertState>(() => createEmptyAlertState(new Date().toISOString()));
  const [storageReady, setStorageReady] = useState(false);
  const deferredQuery = useDeferredValue(filters.query);
  const hasRecordedInitialFilters = useRef(false);

  useEffect(() => {
    const nextFilters = readFilters(new URLSearchParams(window.location.search));
    setFilters(nextFilters);
    setSavedViews(readStoredViews());
    setAlertState(readStoredAlertState());
    setStorageReady(true);
  }, []);

  useEffect(() => {
    const queryString = buildQueryString({
      ...filters,
      query: deferredQuery
    });
    const nextUrl = queryString ? `${pathname}?${queryString}` : pathname;

    window.history.replaceState(null, "", nextUrl);
  }, [
    deferredQuery,
    filters.deadlineType,
    filters.field,
    filters.geography,
    filters.month,
    filters.sort,
    filters.sourceType,
    filters.status,
    pathname
  ]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(savedViewsStorageKey, JSON.stringify(savedViews));
  }, [savedViews, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(alertStateStorageKey, JSON.stringify(alertState));
  }, [alertState, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    if (!hasRecordedInitialFilters.current) {
      hasRecordedInitialFilters.current = true;
      return;
    }

    const activeFilterCount = Object.values({
      q: deferredQuery,
      field: filters.field,
      geography: filters.geography,
      month: filters.month,
      deadlineType: filters.deadlineType,
      status: filters.status,
      sourceType: filters.sourceType
    }).filter(Boolean).length;

    recordWorkflowEvent("filters_changed", pathname, {
      activeFilterCount,
      sortMode: filters.sort
    });
  }, [
    deferredQuery,
    filters.deadlineType,
    filters.field,
    filters.geography,
    filters.month,
    filters.sort,
    filters.sourceType,
    filters.status,
    pathname,
    storageReady
  ]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    setAlertState((current) =>
      syncAlertState({
        savedViews,
        previousState: current,
        deadlines: data.deadlines,
        events: recentEvents,
        now: new Date()
      })
    );
  }, [data.deadlines, recentEvents, savedViews, storageReady]);

  useEffect(() => {
    if (!storageReady || !alertState.records.some((record) => record.status === "queued" || record.status === "retrying")) {
      return;
    }

    setAlertState((current) => deliverQueuedAlerts(current, new Date()));
  }, [alertState.records, storageReady]);

  const effectiveFilters = {
    ...filters,
    query: deferredQuery
  };

  const filteredDeadlines = filterDeadlines(data.deadlines, effectiveFilters);
  const visibleVenues = new Set(filteredDeadlines.map((entry) => entry.venueSlug));
  const filterSummary = summarizeFilters(effectiveFilters, data);
  const suggestedMode = getDefaultWatchlistMode(effectiveFilters, visibleVenues.size);
  const suggestedName = getSuggestedViewName(effectiveFilters, data, visibleVenues.size);
  const alertSummary = summarizeAlertState(alertState);
  const compareOptions = buildCompareOptions(filteredDeadlines);
  const selectedCompareOptions = compareKeys
    .map((key) => compareOptions.find((option) => option.key === key) ?? null)
    .filter((option): option is CompareOption => option !== null);
  const compareMilestoneKinds = [...new Set(selectedCompareOptions.flatMap((option) => option.milestones.map((entry) => entry.kind)))].sort(
    (left, right) => {
      const leftDueAt =
        selectedCompareOptions
          .flatMap((option) => option.milestones.filter((entry) => entry.kind === left))
          .map((entry) => new Date(entry.dueAt).getTime())
          .sort((a, b) => a - b)[0] ?? Number.MAX_SAFE_INTEGER;
      const rightDueAt =
        selectedCompareOptions
          .flatMap((option) => option.milestones.filter((entry) => entry.kind === right))
          .map((entry) => new Date(entry.dueAt).getTime())
          .sort((a, b) => a - b)[0] ?? Number.MAX_SAFE_INTEGER;

      return leftDueAt - rightDueAt;
    }
  );
  const compareGridStyle =
    selectedCompareOptions.length > 0
      ? {
          gridTemplateColumns: `minmax(140px, 0.8fr) repeat(${selectedCompareOptions.length}, minmax(0, 1fr))`
        }
      : undefined;

  useEffect(() => {
    const visibleCompareKeys = new Set(compareOptions.map((option) => option.key));

    setCompareKeys((current) => {
      const next = current.filter((key) => visibleCompareKeys.has(key)).slice(0, 3);
      return next.length === current.length && next.every((key, index) => key === current[index]) ? current : next;
    });
  }, [compareOptions]);

  const newestVerification = filteredDeadlines
    .map((entry) => entry.lastVerifiedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
  const exportScope = {
    name: saveName.trim() || suggestedName,
    generatedAt: new Date().toISOString(),
    filtersSummary: filterSummary,
    deadlines: filteredDeadlines
  };

  function recordExport(kind: "ics" | "csv" | "json" | "feed") {
    recordWorkflowEvent(kind === "feed" ? "feed_link_copied" : "export_downloaded", pathname, {
      format: kind,
      deadlineCount: filteredDeadlines.length,
      venueCount: visibleVenues.size
    });
  }

  function handleExport(kind: "ics" | "csv" | "json") {
    const baseName = slugifyLabel(exportScope.name || "deadline-export") || "deadline-export";

    if (kind === "ics") {
      downloadTextFile(`${baseName}.ics`, buildIcsCalendar(exportScope), "text/calendar");
    } else if (kind === "csv") {
      downloadTextFile(`${baseName}.csv`, buildCsvExport(exportScope), "text/csv");
    } else {
      downloadTextFile(`${baseName}.json`, buildJsonExport(exportScope), "application/json");
    }

    setExportNotice(`${kind.toUpperCase()} export generated for ${filteredDeadlines.length} milestones.`);
    recordExport(kind);
  }

  async function handleCopyFeed() {
    try {
      await navigator.clipboard.writeText(buildCalendarFeedUrl(exportScope));
      setExportNotice(`Calendar feed URL copied for ${filteredDeadlines.length} milestones.`);
      recordExport("feed");
    } catch {
      setExportNotice("Clipboard access is unavailable in this browser session.");
    }
  }

  return (
    <section className="panel browse-panel">
      <div className="panel-heading browse-heading">
        <div>
          <p className="eyebrow">Discovery Workspace</p>
          <h2>Find a narrow, trustworthy opportunity set without leaving the product.</h2>
        </div>
        <div className="browse-stats">
          <strong>{filteredDeadlines.length}</strong>
          <span>
            results across {visibleVenues.size} venues
          </span>
        </div>
      </div>

      <div className="browse-toolbar">
        <label className="field">
          <span>Search</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Venue, field, geography, month, milestone, status"
          />
        </label>

        <label className="field">
          <span>Sort</span>
          <select
            value={filters.sort}
            onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as SortMode }))}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={() => setFilters(defaultFilters)}
        >
          Reset filters
        </button>
      </div>

      <div className="facet-grid">
        <label className="field">
          <span>Field</span>
          <select
            value={filters.field}
            onChange={(event) => setFilters((current) => ({ ...current, field: event.target.value }))}
          >
            <option value="">All fields</option>
            {data.facets.fields.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Geography</span>
          <select
            value={filters.geography}
            onChange={(event) => setFilters((current) => ({ ...current, geography: event.target.value }))}
          >
            <option value="">All regions</option>
            {data.facets.geographies.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Month</span>
          <select
            value={filters.month}
            onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
          >
            <option value="">Any month</option>
            {data.facets.months.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Deadline type</span>
          <select
            value={filters.deadlineType}
            onChange={(event) => setFilters((current) => ({ ...current, deadlineType: event.target.value }))}
          >
            <option value="">Any milestone</option>
            {data.facets.deadlineTypes.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="">Any trust state</option>
            {data.facets.statuses.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Source type</span>
          <select
            value={filters.sourceType}
            onChange={(event) => setFilters((current) => ({ ...current, sourceType: event.target.value }))}
          >
            <option value="">Any source</option>
            {data.facets.sourceTypes.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="workflow-grid">
        <article className="workflow-card">
          <h3>Preset entry points</h3>
          <p className="trust-copy">
            Jump into recurring research workflows, then refine the slice before saving it as a reusable control point.
          </p>
          <div className="pill-row">
            {savedViewPresets.map((preset) => (
              <PresetLink key={preset.label} label={preset.label} params={preset.params} pathname={pathname} />
            ))}
          </div>
        </article>

        <article className="workflow-card">
          <h3>Save current slice</h3>
          <p className="trust-copy">
            Saved views preserve the exact filter, sort, watchlist focus, and alert window so future alerts and exports
            can read the same configuration object instead of branching into a second model.
          </p>
          <div className="save-form-grid">
            <label className="field">
              <span>View name</span>
              <input
                type="text"
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                placeholder={suggestedName}
              />
            </label>

            <label className="field">
              <span>Watchlist focus</span>
              <select
                value={watchlistMode}
                onChange={(event) => setWatchlistMode(event.target.value as WatchlistMode)}
              >
                {watchlistModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Alert window</span>
              <select
                value={String(notificationWindowDays)}
                onChange={(event) => setNotificationWindowDays(Number(event.target.value))}
              >
                {notificationWindowOptions.map((days) => (
                  <option key={days} value={String(days)}>
                    Next {days} days
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="summary-block">
            <strong>Scope preview</strong>
            <div className="pill-row">
              {filterSummary.map((part) => (
                <span key={part} className="facet-pill static-pill">
                  {part}
                </span>
              ))}
            </div>
            <p className="trust-copy">
              Suggested mode: {getWatchlistModeLabel(suggestedMode)}. Alert routing will flag milestones due in the
              next {notificationWindowDays} days and any future trust-state changes inside this slice.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const name = saveName.trim() || suggestedName;
              const nextView = createSavedView({
                id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
                name,
                filters: effectiveFilters,
                watchlistMode,
                notificationWindowDays,
                createdAt: new Date().toISOString()
              });

              setSavedViews((current) => [nextView, ...current].slice(0, 8));
              setSaveName("");
              recordWorkflowEvent("saved_view_created", pathname, {
                watchlistMode,
                notificationWindowDays,
                resultCount: filteredDeadlines.length,
                venueCount: visibleVenues.size
              });
            }}
          >
            Save watchlist
          </button>
        </article>
      </div>

      <div className="workflow-grid">
        <article className="workflow-card">
          <h3>Compare mode</h3>
          <p className="trust-copy">
            Pin up to three nearby venue or track options from the current shortlist and compare them without leaving
            the discovery session.
          </p>
          <div className="pill-row">
            {compareOptions.length > 0 ? (
              compareOptions.slice(0, 6).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className="facet-pill"
                  onClick={() => {
                    setCompareKeys((current) => {
                      if (current.includes(option.key)) {
                        return current.filter((key) => key !== option.key);
                      }

                      const next = [...current, option.key].slice(0, 3);
                      recordWorkflowEvent("compare_link_opened", pathname, {
                        compareKey: option.key,
                        source: "compare_mode"
                      });
                      return next;
                    });
                  }}
                >
                  {compareKeys.includes(option.key) ? `Remove ${option.label}` : `Compare ${option.label}`}
                </button>
              ))
            ) : (
              <span className="empty-state">Tighten the filters to generate a compare shortlist.</span>
            )}
          </div>
          {selectedCompareOptions.length > 0 ? (
            <div className="compare-grid">
              {selectedCompareOptions.map((option) => {
                const nextDeadline = option.milestones[0] ?? null;
                const changedCount = option.milestones.filter((entry) => entry.status === "changed").length;

                return (
                  <article key={option.key} className="saved-view-card">
                    <div className="badge-row">
                      <span className="status-badge tone-info">{option.editionLabel}</span>
                      <span className="status-badge tone-neutral">{option.milestones.length} milestones</span>
                    </div>
                    <strong>{option.label}</strong>
                    <div className="provenance-stack">
                      <span>
                        Next milestone:{" "}
                        {nextDeadline ? `${nextDeadline.kindLabel} on ${dateFormatter.format(new Date(nextDeadline.dueAt))}` : "No live milestone"}
                      </span>
                      <span>{changedCount} milestones currently marked as changed</span>
                      <span>
                        {option.milestones.filter((entry) => entry.isHard).length} hard deadlines,{" "}
                        {option.milestones.filter((entry) => !entry.isHard).length} softer checkpoints
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          {selectedCompareOptions.length >= 2 ? (
            <div className="compare-table">
              <div className="compare-row compare-header" style={compareGridStyle}>
                <span>Milestone</span>
                {selectedCompareOptions.map((option) => (
                  <span key={option.key}>{option.label}</span>
                ))}
              </div>
              {compareMilestoneKinds.map((kind) => (
                <div key={kind} className="compare-row" style={compareGridStyle}>
                  <strong>{titleCase(kind)}</strong>
                  {selectedCompareOptions.map((option) => {
                    const milestone = option.milestones.find((entry) => entry.kind === kind) ?? null;

                    return (
                      <div key={`${option.key}:${kind}`} className="compare-cell">
                        {milestone ? (
                          <>
                            <span className={`status-badge tone-${milestone.statusTone}`}>{milestone.statusLabel}</span>
                            <strong>{dateFormatter.format(new Date(milestone.dueAt))}</strong>
                            <span>{milestone.kindLabel}</span>
                            <span>{milestone.statusDetail}</span>
                          </>
                        ) : (
                          <span className="empty-state">No matching milestone</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : selectedCompareOptions.length === 1 ? (
            <p className="empty-state">Add one more venue or track to unlock the side-by-side compare table.</p>
          ) : null}
        </article>

        <article className="workflow-card">
          <h3>Saved watchlists</h3>
          <p className="trust-copy">
            Each card explains what the watchlist covers right now and when downstream notifications should trigger.
          </p>
          {savedViews.length > 0 ? (
            <div className="saved-view-grid">
              {savedViews.map((view) => {
                const viewEntries = filterDeadlines(data.deadlines, view.filters);
                const upcomingCount = getUpcomingCount(viewEntries, view.notificationWindowDays);
                const changedCount = viewEntries.filter((entry) => entry.status === "changed").length;
                const venueCount = new Set(viewEntries.map((entry) => entry.venueSlug)).size;

                return (
                  <article key={view.id} className="saved-view-card">
                    <div className="badge-row">
                      <span className="status-badge tone-info">{getWatchlistModeLabel(view.watchlistMode)}</span>
                      <span className="status-badge tone-neutral">Next {view.notificationWindowDays} days</span>
                      <span className={`status-badge tone-${getSubscriptionStatusTone(
                        alertState.subscriptions.find((subscription) => subscription.subscriptionId === view.id)?.status ?? "active"
                      )}`}>
                        {getSubscriptionStatusLabel(
                          alertState.subscriptions.find((subscription) => subscription.subscriptionId === view.id)?.status ?? "active"
                        )}
                      </span>
                    </div>
                    <strong>{view.name}</strong>
                    <div className="pill-row">
                      {summarizeFilters(view.filters, data).map((part) => (
                        <span key={`${view.id}:${part}`} className="facet-pill static-pill">
                          {part}
                        </span>
                      ))}
                    </div>
                    <div className="provenance-stack">
                      <span>
                        Covers {viewEntries.length} milestones across {venueCount} venues.
                      </span>
                      <span>
                        Notification scope: {upcomingCount} milestones due soon, {changedCount} rows currently marked as
                        changed.
                      </span>
                      <span>Delivery channel: In-app alert center.</span>
                      <span>Saved {dateFormatter.format(new Date(view.createdAt))}</span>
                    </div>
                    <div className="card-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setFilters(view.filters);
                          setWatchlistMode(view.watchlistMode);
                          setNotificationWindowDays(view.notificationWindowDays);
                          setSaveName(view.name);
                          recordWorkflowEvent("saved_view_applied", pathname, {
                            watchlistMode: view.watchlistMode,
                            notificationWindowDays: view.notificationWindowDays
                          });
                        }}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setSavedViews((current) =>
                            current.map((item) =>
                              item.id === view.id
                                ? {
                                    ...item,
                                    alertsEnabled: !item.alertsEnabled
                                  }
                                : item
                            )
                          )
                        }
                      >
                        {view.alertsEnabled ? "Pause alerts" : "Resume alerts"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setSavedViews((current) => current.filter((item) => item.id !== view.id));
                          recordWorkflowEvent("saved_view_deleted", pathname, {
                            watchlistMode: view.watchlistMode
                          });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="empty-state">
              No saved views yet. Save a shortlist to pin venue clusters, topic sweeps, or deadline windows.
            </p>
          )}
        </article>
      </div>

      <div className="workflow-grid">
        <article className="workflow-card">
          <h3>Export current slice</h3>
          <p className="trust-copy">
            Apply a saved watchlist or refine the current filters, then export exactly that scoped slice as calendar or
            machine-readable output without dropping back to the full dataset.
          </p>
          <div className="provenance-stack">
            <span>
              Scope: {filteredDeadlines.length} milestones across {visibleVenues.size} venues.
            </span>
            <span>Filters: {filterSummary.join(" · ")}</span>
            <span>
              Freshness:{" "}
              {newestVerification ? `latest verification ${dateFormatter.format(new Date(newestVerification))}` : "verification pending in this slice"}
            </span>
          </div>
          <div className="card-actions">
            <button type="button" className="secondary-button" onClick={() => handleExport("ics")}>
              Download ICS
            </button>
            <button type="button" className="secondary-button" onClick={() => handleCopyFeed()}>
              Copy feed URL
            </button>
            <button type="button" className="secondary-button" onClick={() => handleExport("json")}>
              Download JSON
            </button>
            <button type="button" className="secondary-button" onClick={() => handleExport("csv")}>
              Download CSV
            </button>
          </div>
          {exportNotice ? <p className="trust-copy">{exportNotice}</p> : null}
        </article>

        <article className="workflow-card">
          <h3>Alert delivery queue</h3>
          <p className="trust-copy">
            Saved watchlists now evaluate against durable change events plus upcoming windows and deliver the first
            notification path into an in-product queue instead of disappearing into local UI state.
          </p>
          <div className="pill-row">
            <span className="facet-pill static-pill">{alertSummary.activeSubscriptions} active subscriptions</span>
            <span className="facet-pill static-pill">{alertSummary.queuedDeliveries} queued</span>
            <span className="facet-pill static-pill">{alertSummary.deliveredAlerts} delivered</span>
            <span className="facet-pill static-pill">{alertSummary.failedDeliveries} failed</span>
          </div>
          {alertState.records.length > 0 ? (
            <ul className="source-list">
              {alertState.records.slice(0, 6).map((record) => (
                <li key={record.id}>
                  <div className="list-main">
                    <div className="badge-row">
                      <span className={`status-badge tone-${getDeliveryStatusTone(record.status)}`}>
                        {getDeliveryStatusLabel(record.status)}
                      </span>
                      <span className="status-badge tone-neutral">{getAlertReasonLabel(record.reason)}</span>
                      <span className="status-badge tone-neutral">{record.subscriptionName}</span>
                    </div>
                    <strong>{record.title}</strong>
                    <p className="trust-copy">{describeAlertRecord(record)}</p>
                    <div className="provenance-stack">
                      <span>
                        {record.venueName}
                        {record.editionLabel ? ` - ${record.editionLabel}` : ""}
                        {record.trackName ? ` - ${record.trackName}` : ""}
                      </span>
                      <span>Source: {record.sourceLabel}</span>
                      <span>Attempts: {record.attempts}</span>
                      {record.lastError ? <span>Last error: {record.lastError}</span> : null}
                    </div>
                  </div>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setAlertState((current) => acknowledgeAlert(current, record.id, new Date()))}
                    >
                      Acknowledge
                    </button>
                    {(record.status === "failed" || record.status === "acknowledged") && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setAlertState((current) => retryAlert(current, record.id, new Date()))
                        }
                      >
                        Retry delivery
                      </button>
                    )}
                    <Link href={`/venues/${record.venueSlug}`}>Open venue</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No alert deliveries yet. Save a watchlist to seed the queue.</p>
          )}
        </article>

        <article className="workflow-card">
          <h3>Alert state</h3>
          <p className="trust-copy">
            The alert engine keeps machine-readable subscription health for user settings and review queues, even before
            a backend delivery service exists.
          </p>
          <div className="provenance-stack">
            <span>Paused subscriptions: {alertSummary.pausedSubscriptions}</span>
            <span>Needs attention: {alertSummary.needsAttentionSubscriptions}</span>
            <span>Acknowledged alerts: {alertSummary.acknowledgedAlerts}</span>
            <span>Recent durable events scanned: {recentEvents.length}</span>
          </div>
          <details>
            <summary>Open machine-readable state</summary>
            <pre>{JSON.stringify(alertState.subscriptions, null, 2)}</pre>
          </details>
        </article>
      </div>

      <div className="result-summary">
        <span>
          Tracking {data.summary.deadlineCount} imported milestones across {data.summary.venueCount} venues.
        </span>
        <span>Geography currently reflects timezone-region coverage because edition locations are not populated yet.</span>
      </div>

      {filteredDeadlines.length > 0 ? (
        <ul className="venue-list browse-results">
          {filteredDeadlines.map((deadline) => (
            <li key={deadline.id}>
              <div className="list-main">
                <div className="badge-row">
                  <span className={`status-badge tone-${deadline.statusTone}`}>{deadline.statusLabel}</span>
                  <span className="status-badge tone-neutral">{deadline.kindLabel}</span>
                  <span className="status-badge tone-neutral">{deadline.venueAreaLabel}</span>
                  <span className="status-badge tone-neutral">{deadline.geographyLabel}</span>
                  <span className="status-badge tone-neutral">{deadline.sourceTypeLabel}</span>
                </div>
                <strong>{deadline.name}</strong>
                <span>
                  {deadline.venueName} - {deadline.editionLabel}
                  {deadline.trackName ? ` - ${deadline.trackName}` : ""}
                </span>
                <div className="provenance-stack">
                  <span>{deadline.monthLabel}</span>
                  <span>{deadline.statusDetail}</span>
                  <span>
                    {deadline.parserLabel}: {deadline.parserDetail}
                  </span>
                </div>
              </div>
              <div className="list-side">
                <strong>{dateFormatter.format(new Date(deadline.dueAt))}</strong>
                <span>
                  {deadline.lastVerifiedAt
                    ? `Verified ${dateFormatter.format(new Date(deadline.lastVerifiedAt))}`
                    : "Verification pending"}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    const compareKey = getCompareKey(deadline);

                    setCompareKeys((current) => {
                      if (current.includes(compareKey)) {
                        return current.filter((key) => key !== compareKey);
                      }

                      const next = [...current, compareKey].slice(0, 3);
                      recordWorkflowEvent("compare_link_opened", pathname, {
                        compareKey,
                        source: "result_row"
                      });
                      return next;
                    });
                  }}
                >
                  {compareKeys.includes(getCompareKey(deadline)) ? "Remove compare" : "Add compare"}
                </button>
                <Link
                  href={`/venues/${deadline.venueSlug}`}
                  onClick={() =>
                    recordWorkflowEvent("venue_history_opened", pathname, {
                      venueSlug: deadline.venueSlug,
                      source: "browse_results"
                    })
                  }
                >
                  Open venue
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state-stack">
          <p className="empty-state">No deadlines match the current filter set.</p>
          <p className="empty-state">Reset the filters or broaden the search terms to widen the candidate pool.</p>
        </div>
      )}
    </section>
  );
}
