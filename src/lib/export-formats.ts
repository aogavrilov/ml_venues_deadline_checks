import type { DeadlineBrowseEntry } from "@/lib/deadlines";

type ExportScope = {
  name: string;
  generatedAt: string;
  filtersSummary: string[];
  deadlines: DeadlineBrowseEntry[];
};

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function csvEscape(value: string | number | boolean | null) {
  if (value === null) {
    return "";
  }

  const stringValue = String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

export function buildIcsCalendar(scope: ExportScope) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//A* Conference Deadline Monitor//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(scope.name)}`,
    `X-WR-CALDESC:${escapeIcsText(`Generated ${scope.generatedAt}. Scope: ${scope.filtersSummary.join(", ")}`)}`
  ];

  for (const deadline of scope.deadlines) {
    const start = new Date(deadline.dueAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const description = [
      `${deadline.venueName} · ${deadline.editionLabel}`,
      deadline.trackName ? `Track: ${deadline.trackName}` : null,
      `Status: ${deadline.statusLabel}`,
      `Source: ${deadline.sourceLabel ?? deadline.sourceTypeLabel}`,
      deadline.parserDetail
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${deadline.id}@a-star-deadline-monitor`,
      `DTSTAMP:${formatIcsDate(scope.generatedAt)}`,
      `DTSTART:${formatIcsDate(deadline.dueAt)}`,
      `DTEND:${formatIcsDate(end.toISOString())}`,
      `SUMMARY:${escapeIcsText(`${deadline.venueName} · ${deadline.name}`)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `CATEGORIES:${escapeIcsText(deadline.kindLabel)}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function buildJsonExport(scope: ExportScope) {
  return JSON.stringify(
    {
      generatedAt: scope.generatedAt,
      scope: {
        name: scope.name,
        filtersSummary: scope.filtersSummary,
        deadlineCount: scope.deadlines.length,
        venueCount: new Set(scope.deadlines.map((deadline) => deadline.venueSlug)).size
      },
      deadlines: scope.deadlines.map((deadline) => ({
        id: deadline.id,
        venueSlug: deadline.venueSlug,
        venueName: deadline.venueName,
        editionLabel: deadline.editionLabel,
        trackName: deadline.trackName,
        milestoneName: deadline.name,
        milestoneKind: deadline.kind,
        milestoneKindLabel: deadline.kindLabel,
        dueAt: deadline.dueAt,
        timezone: deadline.timezone,
        isHard: deadline.isHard,
        status: deadline.status,
        statusLabel: deadline.statusLabel,
        statusDetail: deadline.statusDetail,
        sourceLabel: deadline.sourceLabel,
        sourceTypeLabel: deadline.sourceTypeLabel,
        parserLabel: deadline.parserLabel,
        parserDetail: deadline.parserDetail,
        lastVerifiedAt: deadline.lastVerifiedAt
      }))
    },
    null,
    2
  );
}

export function buildCsvExport(scope: ExportScope) {
  const header = [
    "venue_slug",
    "venue_name",
    "edition_label",
    "track_name",
    "milestone_name",
    "milestone_kind",
    "due_at",
    "timezone",
    "is_hard",
    "status",
    "status_label",
    "source_label",
    "source_type",
    "last_verified_at"
  ];
  const rows = scope.deadlines.map((deadline) =>
    [
      deadline.venueSlug,
      deadline.venueName,
      deadline.editionLabel,
      deadline.trackName ?? "",
      deadline.name,
      deadline.kind,
      deadline.dueAt,
      deadline.timezone,
      deadline.isHard,
      deadline.status,
      deadline.statusLabel,
      deadline.sourceLabel ?? "",
      deadline.sourceTypeLabel,
      deadline.lastVerifiedAt ?? ""
    ]
      .map((value) => csvEscape(value))
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}

export function buildCalendarFeedUrl(scope: ExportScope) {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcsCalendar(scope))}`;
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
