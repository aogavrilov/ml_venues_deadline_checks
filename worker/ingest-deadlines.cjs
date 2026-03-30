const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const overrides = require("../data/overrides/manual-deadlines.json");
const { extractDeadlines } = require("./conference-dates-parser.cjs");

const database = new DatabaseSync(path.join(process.cwd(), "prisma", "dev.db"));

function parseMetadata(raw) {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function summarizeDeadlines(deadlines) {
  return deadlines.map((deadline) => ({
    kind: deadline.kind,
    name: deadline.name,
    dueAt: deadline.dueAt,
    isHard: deadline.isHard,
    sourceLabel: deadline.sourceLabel ?? null,
    section: deadline.section ?? null
  }));
}

function buildMilestoneDiff(previousDeadlines, currentDeadlines) {
  const previousByKind = new Map(previousDeadlines.map((deadline) => [deadline.kind, deadline]));
  const currentByKind = new Map(currentDeadlines.map((deadline) => [deadline.kind, deadline]));
  const kinds = [...new Set([...previousByKind.keys(), ...currentByKind.keys()])].sort();
  const changes = [];

  for (const kind of kinds) {
    const previous = previousByKind.get(kind) ?? null;
    const current = currentByKind.get(kind) ?? null;

    if (!previous && current) {
      changes.push({ kind, changeType: "added", current });
      continue;
    }

    if (previous && !current) {
      changes.push({ kind, changeType: "removed", previous });
      continue;
    }

    const fieldChanges = [];

    for (const field of ["name", "dueAt", "isHard", "sourceLabel", "section"]) {
      if (previous[field] !== current[field]) {
        fieldChanges.push({
          field,
          previous: previous[field] ?? null,
          current: current[field] ?? null
        });
      }
    }

    if (fieldChanges.length > 0) {
      changes.push({
        kind,
        changeType: "modified",
        previous,
        current,
        fieldChanges
      });
    }
  }

  return {
    status: changes.length > 0 ? "milestones_changed" : "milestones_unchanged",
    changedKinds: changes.map((change) => change.kind),
    changes
  };
}

function getDiffEventType(change) {
  if (change.changeType === "added") {
    return "deadline_added";
  }

  if (change.changeType === "removed") {
    return "deadline_removed";
  }

  const fields = new Set((change.fieldChanges ?? []).map((entry) => entry.field));

  if (fields.has("dueAt")) {
    return "deadline_rescheduled";
  }

  if (fields.has("isHard")) {
    return "deadline_hardness_changed";
  }

  return "deadline_metadata_changed";
}

function getSourceAuthority(snapshot) {
  return snapshot.isCanonical ? "canonical" : "supporting";
}

function buildDeadlineEvents({ snapshot, config, venueId, editionId, trackId, diff }) {
  return (diff?.changes ?? []).map((change) => ({
    id: randomUUID(),
    venueId,
    editionId,
    trackId,
    sourceId: snapshot.sourceId,
    sourceSnapshotId: snapshot.id,
    sourceKey: snapshot.sourceKey,
    sourceKind: snapshot.sourceKind,
    sourceUrl: snapshot.sourceUrl,
    sourceAuthority: getSourceAuthority(snapshot),
    eventType: getDiffEventType(change),
    milestoneKind: change.kind,
    milestoneName: change.current?.name ?? change.previous?.name ?? change.kind,
    detectedAt: snapshot.fetchedAt,
    previousValueJson: change.previous ? JSON.stringify(change.previous) : null,
    currentValueJson: change.current ? JSON.stringify(change.current) : null,
    fieldChangesJson: change.fieldChanges ? JSON.stringify(change.fieldChanges) : null
  }));
}

function updateSnapshotMetadata(snapshotId, updater) {
  const selectSnapshotMetadata = database.prepare(`
    SELECT "extractedJson"
    FROM "SourceSnapshot"
    WHERE "id" = ?
  `);
  const updateSnapshotMetadataStatement = database.prepare(`
    UPDATE "SourceSnapshot"
    SET "extractedJson" = ?, "errorMessage" = ?
    WHERE "id" = ?
  `);
  const snapshot = selectSnapshotMetadata.get(snapshotId);
  const metadata = parseMetadata(snapshot?.extractedJson ?? null);
  const nextMetadata = updater(metadata);

  updateSnapshotMetadataStatement.run(
    JSON.stringify(nextMetadata, null, 2),
    nextMetadata.ingest?.error ?? nextMetadata.parsing?.error ?? null,
    snapshotId
  );

  return nextMetadata;
}

function main() {
  const venueSlug = process.argv[2] ?? "iclr";
  const editionYear = Number(process.argv[3] ?? "2026");
  const config = overrides.entries.find(
    (entry) => entry.venueSlug === venueSlug && entry.editionYear === editionYear
  );

  if (!config) {
    throw new Error(`No override config found for ${venueSlug}/${editionYear}.`);
  }

  const selectVenue = database.prepare(`
    SELECT "id"
    FROM "Venue"
    WHERE "slug" = ?
  `);
  const selectTrack = database.prepare(`
    SELECT "Track"."id"
    FROM "Track"
    INNER JOIN "Venue" ON "Venue"."id" = "Track"."venueId"
    WHERE "Venue"."slug" = ? AND "Track"."slug" = ?
  `);
  const selectSnapshot = database.prepare(`
    SELECT
      "SourceSnapshot"."id",
      "SourceSnapshot"."contentPath",
      "SourceSnapshot"."fetchedAt",
      "SourceSnapshot"."extractedJson",
      "Source"."id" AS "sourceId",
      "Source"."key" AS "sourceKey",
      "Source"."kind" AS "sourceKind",
      "Source"."url" AS "sourceUrl",
      "Source"."isCanonical" AS "isCanonical"
    FROM "SourceSnapshot"
    INNER JOIN "Source" ON "Source"."id" = "SourceSnapshot"."sourceId"
    INNER JOIN "Venue" ON "Venue"."id" = "Source"."venueId"
    WHERE "Venue"."slug" = ? AND "Source"."key" = ? AND "SourceSnapshot"."status" = 'succeeded'
    ORDER BY "SourceSnapshot"."fetchedAt" DESC
    LIMIT 1
  `);
  const selectPreviousSnapshot = database.prepare(`
    SELECT "SourceSnapshot"."contentPath"
    FROM "SourceSnapshot"
    INNER JOIN "Source" ON "Source"."id" = "SourceSnapshot"."sourceId"
    INNER JOIN "Venue" ON "Venue"."id" = "Source"."venueId"
    WHERE
      "Venue"."slug" = ?
      AND "Source"."key" = ?
      AND "SourceSnapshot"."status" = 'succeeded'
      AND "SourceSnapshot"."fetchedAt" < ?
    ORDER BY "SourceSnapshot"."fetchedAt" DESC
    LIMIT 1
  `);
  const selectLatestSnapshot = database.prepare(`
    SELECT "SourceSnapshot"."id", "SourceSnapshot"."status", "SourceSnapshot"."extractedJson"
    FROM "SourceSnapshot"
    INNER JOIN "Source" ON "Source"."id" = "SourceSnapshot"."sourceId"
    INNER JOIN "Venue" ON "Venue"."id" = "Source"."venueId"
    WHERE "Venue"."slug" = ? AND "Source"."key" = ?
    ORDER BY "SourceSnapshot"."fetchedAt" DESC
    LIMIT 1
  `);
  const selectEdition = database.prepare(`
    SELECT "id"
    FROM "Edition"
    WHERE "venueId" = ? AND "year" = ?
  `);
  const insertEdition = database.prepare(`
    INSERT INTO "Edition" ("id", "venueId", "year", "label", "status", "eventStartDate", "eventEndDate", "locationName", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const updateEdition = database.prepare(`
    UPDATE "Edition"
    SET "label" = ?, "status" = ?, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ?
  `);
  const deleteDeadlines = database.prepare(`
    DELETE FROM "Deadline"
    WHERE "editionId" = ?
  `);
  const insertDeadline = database.prepare(`
    INSERT INTO "Deadline" ("id", "venueId", "editionId", "trackId", "name", "kind", "dueAt", "timezone", "isHard", "notes", "sourceSnapshotId", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const deleteDeadlineEvents = database.prepare(`
    DELETE FROM "DeadlineEvent"
    WHERE "sourceSnapshotId" = ?
  `);
  const insertDeadlineEvent = database.prepare(`
    INSERT INTO "DeadlineEvent" (
      "id",
      "venueId",
      "editionId",
      "trackId",
      "sourceId",
      "sourceSnapshotId",
      "sourceKey",
      "sourceKind",
      "sourceUrl",
      "sourceAuthority",
      "eventType",
      "milestoneKind",
      "milestoneName",
      "detectedAt",
      "previousValueJson",
      "currentValueJson",
      "fieldChangesJson",
      "createdAt"
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const venue = selectVenue.get(config.venueSlug);
  const track = selectTrack.get(config.venueSlug, config.trackSlug);
  const snapshot = selectSnapshot.get(config.venueSlug, config.sourceKey);
  const latestSnapshot = selectLatestSnapshot.get(config.venueSlug, config.sourceKey);

  if (!venue) {
    throw new Error(`Venue ${config.venueSlug} is missing from the database.`);
  }

  if (!track) {
    throw new Error(`Track ${config.venueSlug}/${config.trackSlug} is missing from the database.`);
  }

  if (!snapshot) {
    if (latestSnapshot?.id) {
      updateSnapshotMetadata(latestSnapshot.id, (metadata) => ({
        ...metadata,
        ingest: {
          status: "failed",
          error: `No successful snapshot found for ${config.venueSlug}/${config.sourceKey}. Run worker:fetch first.`,
          importedDeadlineCount: 0,
          queue: [
            {
              code: latestSnapshot.status === "failed" ? "fetch_failed" : "missing_successful_snapshot",
              venueSlug: config.venueSlug,
              sourceKey: config.sourceKey,
              editionYear: config.editionYear
            }
          ]
        }
      }));
    }

    throw new Error(`No successful snapshot found for ${config.venueSlug}/${config.sourceKey}. Run worker:fetch first.`);
  }

  const html = readFileSync(snapshot.contentPath, "utf8");
  const previousSnapshot = selectPreviousSnapshot.get(config.venueSlug, config.sourceKey, snapshot.fetchedAt);
  let extracted;

  try {
    extracted = extractDeadlines(html, config);
  } catch (error) {
    updateSnapshotMetadata(snapshot.id, (metadata) => ({
      ...metadata,
      parsing: {
        ...(metadata.parsing ?? {}),
        status: "failed",
        parser: config.parser,
        editionYear: config.editionYear,
        error: error.message
      },
      ingest: {
        status: "failed",
        error: error.message,
        importedDeadlineCount: 0,
        queue: [
          {
            code: "parser_failed",
            venueSlug: config.venueSlug,
            sourceKey: config.sourceKey,
            editionYear: config.editionYear
          }
        ]
      }
    }));

    throw error;
  }

  const mappedDeadlines = extracted.deadlines;
  const currentDeadlineSummary = summarizeDeadlines(mappedDeadlines);
  const metadata = parseMetadata(snapshot.extractedJson);
  let diff = metadata.parsing?.diff;

  if (!diff) {
    diff = {
      status: "first_structured_snapshot",
      changedKinds: [],
      changes: []
    };

    if (previousSnapshot?.contentPath) {
      try {
        const previousHtml = readFileSync(previousSnapshot.contentPath, "utf8");
        const previousExtraction = extractDeadlines(previousHtml, config);
        diff = buildMilestoneDiff(summarizeDeadlines(previousExtraction.deadlines), currentDeadlineSummary);
      } catch (previousError) {
        diff = {
          status: "previous_parse_failed",
          changedKinds: [],
          changes: [],
          previousError: previousError.message
        };
      }
    }
  }

  const existingEdition = selectEdition.get(venue.id, config.editionYear);
  const editionId = existingEdition?.id ?? randomUUID();
  const deadlineEvents = buildDeadlineEvents({
    snapshot,
    config,
    venueId: venue.id,
    editionId,
    trackId: track.id,
    diff
  });

  database.exec("BEGIN");

  if (existingEdition) {
    updateEdition.run(config.editionLabel, config.editionStatus, editionId);
  } else {
    insertEdition.run(editionId, venue.id, config.editionYear, config.editionLabel, config.editionStatus);
  }

  deleteDeadlines.run(editionId);
  deleteDeadlineEvents.run(snapshot.id);

  for (const deadline of mappedDeadlines) {
    insertDeadline.run(
      randomUUID(),
      venue.id,
      editionId,
      track.id,
      deadline.name,
      deadline.kind,
      deadline.dueAt,
      "UTC",
      deadline.isHard ? 1 : 0,
      deadline.notes,
      snapshot.id
    );
  }

  for (const event of deadlineEvents) {
    insertDeadlineEvent.run(
      event.id,
      event.venueId,
      event.editionId,
      event.trackId,
      event.sourceId,
      event.sourceSnapshotId,
      event.sourceKey,
      event.sourceKind,
      event.sourceUrl,
      event.sourceAuthority,
      event.eventType,
      event.milestoneKind,
      event.milestoneName,
      event.detectedAt,
      event.previousValueJson,
      event.currentValueJson,
      event.fieldChangesJson
    );
  }

  database.exec("COMMIT");

  updateSnapshotMetadata(snapshot.id, (metadata) => ({
    ...metadata,
    parsing: {
      ...(metadata.parsing ?? {}),
      status: "parsed",
      parser: config.parser,
      editionYear: config.editionYear,
      deadlineCount: mappedDeadlines.length,
      error: null,
      deadlines: currentDeadlineSummary,
      diff
    },
    ingest: {
      status: "succeeded",
      error: null,
      importedDeadlineCount: mappedDeadlines.length,
      eventCount: deadlineEvents.length,
      queue: []
    }
  }));

  console.log(
    JSON.stringify(
      {
        venue: config.venueSlug,
        editionYear: config.editionYear,
        sourceSnapshotId: snapshot.id,
        targetSection: config.targetSection ?? null,
        eventCount: deadlineEvents.length,
        importedDeadlines: mappedDeadlines
      },
      null,
      2
    )
  );
}

try {
  main();
  database.close();
} catch (error) {
  try {
    database.exec("ROLLBACK");
  } catch {}
  console.error(error);
  database.close();
  process.exit(1);
}
