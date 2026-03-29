const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const overrides = require("../data/overrides/manual-deadlines.json");
const { extractCanonicalDeadlines } = require("./conference-dates-parser.cjs");

const database = new DatabaseSync(path.join(process.cwd(), "prisma", "dev.db"));

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
    SELECT "SourceSnapshot"."id", "SourceSnapshot"."contentPath", "SourceSnapshot"."fetchedAt"
    FROM "SourceSnapshot"
    INNER JOIN "Source" ON "Source"."id" = "SourceSnapshot"."sourceId"
    INNER JOIN "Venue" ON "Venue"."id" = "Source"."venueId"
    WHERE "Venue"."slug" = ? AND "Source"."key" = ? AND "SourceSnapshot"."status" = 'succeeded'
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
  const venue = selectVenue.get(config.venueSlug);
  const track = selectTrack.get(config.venueSlug, config.trackSlug);
  const snapshot = selectSnapshot.get(config.venueSlug, config.sourceKey);

  if (!venue) {
    throw new Error(`Venue ${config.venueSlug} is missing from the database.`);
  }

  if (!track) {
    throw new Error(`Track ${config.venueSlug}/${config.trackSlug} is missing from the database.`);
  }

  if (!snapshot) {
    throw new Error(`No successful snapshot found for ${config.venueSlug}/${config.sourceKey}. Run worker:fetch first.`);
  }

  const html = readFileSync(snapshot.contentPath, "utf8");
  const extracted = extractCanonicalDeadlines(html, config);
  const mappedDeadlines = extracted.deadlines;
  const existingEdition = selectEdition.get(venue.id, config.editionYear);
  const editionId = existingEdition?.id ?? randomUUID();

  database.exec("BEGIN");

  if (existingEdition) {
    updateEdition.run(config.editionLabel, config.editionStatus, editionId);
  } else {
    insertEdition.run(editionId, venue.id, config.editionYear, config.editionLabel, config.editionStatus);
  }

  deleteDeadlines.run(editionId);

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

  database.exec("COMMIT");

  console.log(
    JSON.stringify(
      {
        venue: config.venueSlug,
        editionYear: config.editionYear,
        sourceSnapshotId: snapshot.id,
        targetSection: config.targetSection ?? null,
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
