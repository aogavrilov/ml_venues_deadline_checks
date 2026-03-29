const { createHash, randomUUID } = require("node:crypto");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const registry = require("../data/sources/registry.json");

const database = new DatabaseSync(path.join(process.cwd(), "prisma", "dev.db"));

function normalizeSnapshotBody(body, contentType) {
  if (!contentType?.includes("html")) {
    return body;
  }

  return body
    .replace(/\snonce="[^"]*"/gi, "")
    .replace(/\sintegrity="[^"]*"/gi, "")
    .replace(/\bcrossorigin="[^"]*"/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveTarget() {
  const venueSlug = process.argv[2] ?? "iclr";
  const sourceKey = process.argv[3] ?? "official-dates";
  const venue = registry.venues.find((entry) => entry.slug === venueSlug);

  if (!venue) {
    throw new Error(`Unknown venue '${venueSlug}'.`);
  }

  const source = venue.sources.find((entry) => entry.key === sourceKey);

  if (!source) {
    throw new Error(`Unknown source '${venueSlug}/${sourceKey}'.`);
  }

  return { venue, source };
}

async function main() {
  const { venue, source } = resolveTarget();
  const selectSource = database.prepare(`
    SELECT "Source"."id"
    FROM "Source"
    INNER JOIN "Venue" ON "Venue"."id" = "Source"."venueId"
    WHERE "Venue"."slug" = ? AND "Source"."key" = ?
  `);
  const selectPreviousSnapshot = database.prepare(`
    SELECT "id", "contentHash", "fetchedAt"
    FROM "SourceSnapshot"
    WHERE "sourceId" = ?
    ORDER BY "fetchedAt" DESC
    LIMIT 1
  `);
  const dbSource = selectSource.get(venue.slug, source.key);

  if (!dbSource) {
    throw new Error(`Source ${venue.slug}/${source.key} is missing from the database. Run db:seed first.`);
  }

  const previousSnapshot = selectPreviousSnapshot.get(dbSource.id);
  const response = await fetch(source.url, {
    redirect: "follow",
    headers: {
      "user-agent": "paperclip-aog-deadline-monitor/0.1"
    }
  });
  const body = await response.text();
  const contentType = response.headers.get("content-type");
  const extension = contentType?.includes("html") ? "html" : "txt";
  const fetchedAt = new Date();
  const stamp = fetchedAt.toISOString().replace(/[:.]/g, "-");
  const snapshotRoot = path.join(process.cwd(), "data", "snapshots", "fetched");
  const filePath = path.join(snapshotRoot, `${venue.slug}--${source.key}--${stamp}.${extension}`);
  const normalizedBody = normalizeSnapshotBody(body, contentType);
  const contentHash = createHash("sha256").update(normalizedBody).digest("hex");
  const change = previousSnapshot
    ? previousSnapshot.contentHash === contentHash
      ? {
          status: "unchanged",
          previousSnapshotId: previousSnapshot.id,
          previousFetchedAt: previousSnapshot.fetchedAt
        }
      : {
          status: "changed",
          previousSnapshotId: previousSnapshot.id,
          previousFetchedAt: previousSnapshot.fetchedAt
        }
    : {
        status: "first_snapshot",
        previousSnapshotId: null,
        previousFetchedAt: null
      };
  const metadata = JSON.stringify(
    {
      fetchedUrl: source.url,
      finalUrl: response.url,
      contentType,
      fetchedAt: fetchedAt.toISOString(),
      change
    },
    null,
    2
  );
  const insertSnapshot = database.prepare(`
    INSERT INTO "SourceSnapshot" ("id", "sourceId", "fetchedAt", "status", "httpStatus", "contentHash", "contentPath", "extractedJson", "errorMessage", "createdAt")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  await mkdir(snapshotRoot, { recursive: true });
  await writeFile(filePath, body, "utf8");

  insertSnapshot.run(
    randomUUID(),
    dbSource.id,
    fetchedAt.toISOString(),
    response.ok ? "succeeded" : "failed",
    response.status,
    contentHash,
    filePath,
    metadata,
    response.ok ? null : `HTTP ${response.status}`
  );

  console.log(
    JSON.stringify(
      {
        venue: venue.slug,
        source: source.key,
        status: response.status,
        filePath,
        contentHash,
        change
      },
      null,
      2
    )
  );
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
