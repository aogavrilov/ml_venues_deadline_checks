import "server-only";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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
  editionLabel: string;
  trackName: string | null;
  sourceKey: string | null;
  sourceUrl: string | null;
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
  lastVerifiedAt: string | null;
};

type SourceRow = {
  key: string;
  url: string;
  kind: string;
  isCanonical: number;
  notes: string;
};

function openDatabase() {
  return new DatabaseSync(path.join(process.cwd(), "prisma", "dev.db"), {
    readOnly: true
  });
}

function fromSqliteDate(value: string | null) {
  return value ? new Date(value) : null;
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
            "Edition"."label" AS "editionLabel",
            "Track"."name" AS "trackName",
            "Source"."key" AS "sourceKey",
            "Source"."url" AS "sourceUrl",
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
        id: deadline.id,
        name: deadline.name,
        kind: deadline.kind,
        dueAt: new Date(deadline.dueAt),
        timezone: deadline.timezone,
        isHard: Boolean(deadline.isHard),
        notes: deadline.notes,
        venueSlug: deadline.venueSlug,
        venueName: deadline.venueName,
        editionLabel: deadline.editionLabel,
        trackName: deadline.trackName,
        sourceLabel: deadline.sourceKey,
        sourceUrl: deadline.sourceUrl,
        lastVerifiedAt: fromSqliteDate(deadline.lastVerifiedAt)
      })),
      venueSummary
    };
  } finally {
    database.close();
  }
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
            "Source"."notes" AS "notes"
          FROM "Source"
          INNER JOIN "Venue" ON "Venue"."id" = "Source"."venueId"
          WHERE "Venue"."slug" = ?
          ORDER BY "Source"."isCanonical" DESC, "Source"."key" ASC
        `
      )
      .all(slug) as SourceRow[];
    const firstRow = rows[0];
    const editionsById = new Map<
      string,
      {
        id: string;
        label: string;
        status: string;
        year: number;
        deadlines: Array<{
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
        id: row.deadlineId,
        name: row.deadlineName,
        kind: row.deadlineKind,
        dueAt: new Date(row.deadlineDueAt),
        timezone: row.deadlineTimezone,
        isHard: Boolean(row.deadlineIsHard),
        notes: row.deadlineNotes,
        trackName: row.trackName,
        sourceKey: row.sourceKey,
        sourceUrl: row.sourceUrl,
        lastVerifiedAt: fromSqliteDate(row.lastVerifiedAt)
      });
    }

    return {
      slug: firstRow.venueSlug,
      name: firstRow.venueName,
      series: firstRow.venueSeries,
      timezone: firstRow.venueTimezone,
      editions: [...editionsById.values()],
      sources: sources.map((source) => ({
        key: source.key,
        url: source.url,
        kind: source.kind,
        isCanonical: Boolean(source.isCanonical),
        notes: source.notes
      }))
    };
  } finally {
    database.close();
  }
}
