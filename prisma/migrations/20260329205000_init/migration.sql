CREATE TABLE "Venue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Edition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eventStartDate" DATETIME,
    "eventEndDate" DATETIME,
    "locationName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Edition_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Track_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "selectorsJson" TEXT,
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Source_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SourceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "contentHash" TEXT,
    "contentPath" TEXT,
    "extractedJson" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceSnapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "trackId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "isHard" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sourceSnapshotId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deadline_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deadline_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deadline_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deadline_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "SourceSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");
CREATE UNIQUE INDEX "Edition_venueId_year_key" ON "Edition"("venueId", "year");
CREATE INDEX "Edition_year_idx" ON "Edition"("year");
CREATE UNIQUE INDEX "Track_venueId_slug_key" ON "Track"("venueId", "slug");
CREATE UNIQUE INDEX "Source_venueId_key_key" ON "Source"("venueId", "key");
CREATE INDEX "SourceSnapshot_sourceId_fetchedAt_idx" ON "SourceSnapshot"("sourceId", "fetchedAt");
CREATE INDEX "Deadline_venueId_dueAt_idx" ON "Deadline"("venueId", "dueAt");
CREATE INDEX "Deadline_editionId_dueAt_idx" ON "Deadline"("editionId", "dueAt");
