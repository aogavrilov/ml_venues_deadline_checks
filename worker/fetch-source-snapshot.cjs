const { createHash, randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const registry = require("../data/sources/registry.json");
const overrides = require("../data/overrides/manual-deadlines.json");
const { extractDeadlines } = require("./conference-dates-parser.cjs");

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

function selectParserConfig(venueSlug, sourceKey) {
  return [...overrides.entries]
    .filter((entry) => entry.venueSlug === venueSlug && entry.sourceKey === sourceKey)
    .sort((left, right) => right.editionYear - left.editionYear)[0] ?? null;
}

function summarizeDeadlines(deadlines) {
  return deadlines
    .map((deadline) => ({
      kind: deadline.kind,
      name: deadline.name,
      dueAt: deadline.dueAt,
      isHard: deadline.isHard,
      sourceLabel: deadline.sourceLabel ?? null,
      section: deadline.section ?? null
    }))
    .sort((left, right) => left.kind.localeCompare(right.kind));
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

async function main() {
  const { venue, source } = resolveTarget();
  const parserConfig = selectParserConfig(venue.slug, source.key);
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
  let parsing;

  if (!parserConfig) {
    parsing = {
      status: "unavailable",
      parser: null,
      editionYear: null,
      deadlineCount: null,
      error: null,
      diff: {
        status: "not_applicable",
        changedKinds: [],
        changes: []
      }
    };
  } else {
    try {
      const currentExtraction = extractDeadlines(body, parserConfig);
      const currentDeadlines = summarizeDeadlines(currentExtraction.deadlines);
      let diff = {
        status: "first_structured_snapshot",
        changedKinds: [],
        changes: []
      };

      if (previousSnapshot?.contentPath) {
        try {
          const previousHtml = readFileSync(previousSnapshot.contentPath, "utf8");
          const previousExtraction = extractDeadlines(previousHtml, parserConfig);
          diff = buildMilestoneDiff(summarizeDeadlines(previousExtraction.deadlines), currentDeadlines);
        } catch (previousError) {
          diff = {
            status: "previous_parse_failed",
            changedKinds: [],
            changes: [],
            previousError: previousError.message
          };
        }
      }

      parsing = {
        status: "parsed",
        parser: parserConfig.parser,
        editionYear: parserConfig.editionYear,
        deadlineCount: currentDeadlines.length,
        error: null,
        deadlines: currentDeadlines,
        diff
      };
    } catch (error) {
      parsing = {
        status: "failed",
        parser: parserConfig.parser,
        editionYear: parserConfig.editionYear,
        deadlineCount: null,
        error: error.message,
        diff: {
          status: "parse_failed",
          changedKinds: [],
          changes: []
        }
      };
    }
  }
  const metadata = JSON.stringify(
    {
      schemaVersion: 2,
      source: {
        venueSlug: venue.slug,
        sourceKey: source.key,
        sourceUrl: source.url
      },
      fetch: {
        fetchedUrl: source.url,
        finalUrl: response.url,
        contentType,
        fetchedAt: fetchedAt.toISOString(),
        httpStatus: response.status
      },
      change,
      parsing,
      ingest: {
        status: "pending",
        error: null,
        importedDeadlineCount: null,
        queue: []
      }
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
