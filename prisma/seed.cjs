const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const registry = require("../data/sources/registry.json");

const database = new DatabaseSync(path.join(process.cwd(), "prisma", "dev.db"));

async function main() {
  database.exec("BEGIN");

  database.exec('DELETE FROM "SourceSnapshot";');
  database.exec('DELETE FROM "Deadline";');
  database.exec('DELETE FROM "Track";');
  database.exec('DELETE FROM "Source";');
  database.exec('DELETE FROM "Edition";');
  database.exec('DELETE FROM "Venue";');

  const insertVenue = database.prepare(`
    INSERT INTO "Venue" ("id", "slug", "name", "series", "area", "timezone", "isActive", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const insertTrack = database.prepare(`
    INSERT INTO "Track" ("id", "venueId", "slug", "name", "area", "isDefault", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const insertSource = database.prepare(`
    INSERT INTO "Source" ("id", "venueId", "key", "kind", "url", "notes", "selectorsJson", "isCanonical", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  for (const venue of registry.venues) {
    const venueId = randomUUID();

    insertVenue.run(
      venueId,
      venue.slug,
      venue.name,
      venue.series,
      venue.area,
      venue.timezone,
      1
    );

    for (const [index, track] of venue.tracks.entries()) {
      insertTrack.run(
        randomUUID(),
        venueId,
        track.slug,
        track.name,
        track.area,
        index === 0 ? 1 : 0
      );
    }

    for (const [index, source] of venue.sources.entries()) {
      insertSource.run(
        randomUUID(),
        venueId,
        source.key,
        source.kind,
        source.url,
        source.notes,
        source.selectors ? JSON.stringify(source.selectors) : null,
        index === 0 ? 1 : 0
      );
    }
  }

  database.exec("COMMIT");
}

main()
  .then(async () => {
    database.close();
  })
  .catch(async (error) => {
    database.exec("ROLLBACK");
    console.error(error);
    database.close();
    process.exit(1);
  });
