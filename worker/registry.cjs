const { createHash, randomUUID } = require("node:crypto");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const registry = require("../data/sources/registry.json");

const database = new DatabaseSync(path.join(process.cwd(), "prisma", "dev.db"));

async function main() {
  const snapshotRoot = path.join(process.cwd(), "data", "snapshots", "registry");
  await mkdir(snapshotRoot, { recursive: true });

  const selectVenue = database.prepare(`
    SELECT "id"
    FROM "Venue"
    WHERE "slug" = ?
  `);
  const selectSources = database.prepare(`
    SELECT "id", "key"
    FROM "Source"
    WHERE "venueId" = ?
  `);
  const insertSnapshot = database.prepare(`
    INSERT INTO "SourceSnapshot" ("id", "sourceId", "fetchedAt", "status", "httpStatus", "contentHash", "contentPath", "extractedJson", "errorMessage", "createdAt")
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, NULL, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
  `);

  for (const venue of registry.venues) {
    const dbVenue = selectVenue.get(venue.slug);

    if (!dbVenue) {
      throw new Error(`Venue ${venue.slug} is missing from the database. Run db:seed first.`);
    }

    const dbSources = selectSources.all(dbVenue.id);

    for (const source of venue.sources) {
      const dbSource = dbSources.find((entry) => entry.key === source.key);

      if (!dbSource) {
        throw new Error(`Source ${venue.slug}/${source.key} is missing from the database.`);
      }

      const payload = JSON.stringify(
        {
          venue: venue.slug,
          source
        },
        null,
        2
      );
      const contentHash = createHash("sha256").update(payload).digest("hex");
      const filePath = path.join(snapshotRoot, `${venue.slug}--${source.key}.json`);

      await writeFile(filePath, `${payload}\n`, "utf8");

      insertSnapshot.run(
        randomUUID(),
        dbSource.id,
        "succeeded",
        contentHash,
        filePath,
        payload
      );
    }
  }
}

main()
  .then(async () => {
    database.close();
  })
  .catch(async (error) => {
    console.error(error);
    database.close();
    process.exit(1);
  });
