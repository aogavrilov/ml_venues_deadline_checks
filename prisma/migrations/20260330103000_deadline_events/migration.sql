-- CreateTable
CREATE TABLE "DeadlineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "editionId" TEXT,
    "trackId" TEXT,
    "sourceId" TEXT NOT NULL,
    "sourceSnapshotId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceAuthority" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "milestoneKind" TEXT NOT NULL,
    "milestoneName" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL,
    "previousValueJson" TEXT,
    "currentValueJson" TEXT,
    "fieldChangesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeadlineEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeadlineEvent_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeadlineEvent_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeadlineEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeadlineEvent_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "SourceSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeadlineEvent_venueId_detectedAt_idx" ON "DeadlineEvent"("venueId", "detectedAt");

-- CreateIndex
CREATE INDEX "DeadlineEvent_sourceSnapshotId_detectedAt_idx" ON "DeadlineEvent"("sourceSnapshotId", "detectedAt");

-- CreateIndex
CREATE INDEX "DeadlineEvent_eventType_detectedAt_idx" ON "DeadlineEvent"("eventType", "detectedAt");
