import Link from "next/link";
import { DeadlineBrowser } from "./deadline-browser";
import { TrackedLink } from "./tracked-link";
import { WorkflowAdoption } from "./workflow-adoption";
import { getDeadlineBrowseData, getMonitorHealth, getRecentDeadlineEvents } from "@/lib/deadlines";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

export default async function HomePage() {
  const browseData = await getDeadlineBrowseData();
  const health = await getMonitorHealth();
  const recentEvents = await getRecentDeadlineEvents(40);

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">A* Conference Deadline Monitor</p>
        <h1>Official-source deadline ingestion with provenance-backed public views.</h1>
        <p className="lede">
          The current ingestion slice fetches official conference dates pages, normalizes canonical deadlines into the
          database, and now exposes a faceted discovery workspace so a researcher can narrow a large venue set quickly
          without exporting data or scanning the full list manually.
        </p>
      </section>

      <section className="grid">
        <DeadlineBrowser data={browseData} recentEvents={recentEvents} />

        <article className="panel">
          <div className="panel-heading">
            <h2>Venue coverage board</h2>
            <span>
              {health.summary.coveredVenues}/{health.venues.length} fully covered venues
            </span>
          </div>
          <ul className="source-list">
            {health.venues.map((venue) => (
              <li key={venue.slug}>
                <div className="list-main">
                  <div className="badge-row">
                    <span className={`status-badge tone-${venue.coverage.tone}`}>{venue.coverage.label}</span>
                    <span className={`status-badge tone-${venue.freshness.tone}`}>{venue.freshness.label}</span>
                    <span className="status-badge tone-neutral">
                      {venue.coveredSourceCount} parser-backed / {venue.sourceCount} tracked
                    </span>
                  </div>
                  <strong>{venue.name}</strong>
                  <div className="provenance-stack">
                    <span>{venue.deadlineCount} imported deadlines</span>
                    <span>{venue.coverage.detail}</span>
                    <span>{venue.freshness.detail}</span>
                  </div>
                </div>
                <Link href={`/venues/${venue.slug}`}>Inspect venue</Link>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <WorkflowAdoption
        rollout={{
          blocked: health.queue.blocked.length,
          atRisk: health.queue.atRisk.length,
          waitingReview: health.queue.waitingReview.length,
          waitingApproval: health.queue.waitingApproval.length
        }}
      />

      <section className="grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>Blocked queue</h2>
            <span>{health.queue.blocked.length} items</span>
          </div>
          {health.queue.blocked.length > 0 ? (
            <ul className="source-list">
              {health.queue.blocked.map((item) => (
                <li key={`blocked:${item.venueSlug}:${item.sourceKey}:${item.issueType}`}>
                  <div className="list-main">
                    <div className="badge-row">
                      <span className={`status-badge tone-${item.tone}`}>{item.actionLabel}</span>
                    </div>
                    <strong>
                      {item.venueName} - {item.sourceKey}
                    </strong>
                    <p className="trust-copy">{item.detail}</p>
                  </div>
                  <div className="source-meta">
                    <span>{item.lastVerifiedAt ? dateFormatter.format(item.lastVerifiedAt) : "Never verified"}</span>
                    <Link href={`/venues/${item.venueSlug}`}>Open venue</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No fetch, parse, or missing-source blockers are active.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>Waiting for review</h2>
            <span>{health.queue.waitingReview.length} items</span>
          </div>
          {health.queue.waitingReview.length > 0 ? (
            <ul className="source-list">
              {health.queue.waitingReview.map((item) => (
                <li key={`review:${item.venueSlug}:${item.sourceKey}:${item.issueType}`}>
                  <div className="list-main">
                    <div className="badge-row">
                      <span className={`status-badge tone-${item.tone}`}>{item.actionLabel}</span>
                    </div>
                    <strong>
                      {item.venueName} - {item.sourceKey}
                    </strong>
                    <p className="trust-copy">{item.detail}</p>
                  </div>
                  <div className="source-meta">
                    <span>{item.lastVerifiedAt ? dateFormatter.format(item.lastVerifiedAt) : "Manual entry"}</span>
                    <Link href={`/venues/${item.venueSlug}`}>Open venue</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No changed milestones or parser-coverage reviews are waiting.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>Waiting for approval</h2>
            <span>{health.queue.waitingApproval.length} items</span>
          </div>
          {health.queue.waitingApproval.length > 0 ? (
            <ul className="source-list">
              {health.queue.waitingApproval.map((item) => (
                <li key={`approval:${item.venueSlug}:${item.sourceKey}:${item.issueType}`}>
                  <div className="list-main">
                    <div className="badge-row">
                      <span className={`status-badge tone-${item.tone}`}>{item.actionLabel}</span>
                    </div>
                    <strong>
                      {item.venueName} - {item.sourceKey}
                    </strong>
                    <p className="trust-copy">{item.detail}</p>
                  </div>
                  <div className="source-meta">
                    <span>{item.lastVerifiedAt ? dateFormatter.format(item.lastVerifiedAt) : "Manual entry"}</span>
                    <Link href={`/venues/${item.venueSlug}`}>Open venue</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No manual-tracking leftovers are waiting for automation approval.</p>
          )}
        </article>
      </section>

      <section className="grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>Change feed</h2>
            <span>{recentEvents.length} recent events</span>
          </div>
          {recentEvents.length > 0 ? (
            <ul className="source-list">
              {recentEvents.map((event) => (
                <li key={event.id}>
                  <div className="list-main">
                    <div className="badge-row">
                      <span className={`status-badge tone-${event.summary.tone}`}>{event.summary.label}</span>
                      <span className="status-badge tone-neutral">{event.sourceAuthority}</span>
                    </div>
                    <strong>
                      {event.venueName} - {event.milestoneName}
                    </strong>
                    <p className="trust-copy">{event.summary.detail}</p>
                    <div className="provenance-stack">
                      <span>
                        {event.editionLabel ?? "Unknown edition"}
                        {event.trackName ? ` · ${event.trackName}` : ""}
                      </span>
                      <span>Source: {event.sourceKey}</span>
                    </div>
                  </div>
                  <div className="source-meta">
                    <span>{dateFormatter.format(new Date(event.detectedAt))}</span>
                    <TrackedLink
                      href={`/venues/${event.venueSlug}`}
                      eventName="change_feed_opened"
                      eventMetadata={{ venueSlug: event.venueSlug }}
                    >
                      Open venue history
                    </TrackedLink>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No durable change events are stored yet. Run fetch and ingest to seed the feed.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>At-risk queue</h2>
            <span>{health.queue.atRisk.length} items</span>
          </div>
          {health.queue.atRisk.length > 0 ? (
            <ul className="source-list">
              {health.queue.atRisk.map((item) => (
                <li key={`risk:${item.venueSlug}:${item.sourceKey}:${item.issueType}`}>
                  <div className="list-main">
                    <div className="badge-row">
                      <span className={`status-badge tone-${item.tone}`}>{item.actionLabel}</span>
                    </div>
                    <strong>
                      {item.venueName} - {item.sourceKey}
                    </strong>
                    <p className="trust-copy">{item.detail}</p>
                  </div>
                  <div className="source-meta">
                    <span>{item.lastVerifiedAt ? dateFormatter.format(item.lastVerifiedAt) : "Never verified"}</span>
                    <Link href="/health">Open health</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No stale-but-still-live sources are currently at risk.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>Coverage summary</h2>
            <span>{browseData.summary.venueCount} venues tracked</span>
          </div>
          <ul className="checklist">
            <li>
              <span>Covered venues</span>
              <strong>{health.summary.coveredVenues}</strong>
            </li>
            <li>
              <span>Partial coverage</span>
              <strong>{health.summary.partialVenues}</strong>
            </li>
            <li>
              <span>Monitoring only</span>
              <strong>{health.summary.monitoringOnlyVenues}</strong>
            </li>
            <li>
              <span>Missing deadlines</span>
              <strong>{health.summary.missingVenues}</strong>
            </li>
          </ul>
        </article>
      </section>

      <section className="grid lower-grid">
        <article className="panel">
          <h2>What shipped in this increment</h2>
          <ul className="checklist">
            <li>Fetched raw HTML snapshots from the official ICLR, NeurIPS, ICML, and CVPR dates pages plus the ACL 2026 homepage</li>
            <li>Normalized canonical deadlines into Prisma with source provenance for five venues, including ACL-specific ARR milestones</li>
            <li>Moved common milestone matching into a shared conference dates parser instead of exact row-name overrides</li>
            <li>Upgraded source metadata from hash-only checks to structured milestone-aware diff signals where parser coverage exists</li>
            <li>Surfaced explicit fetch and parser failures through the public health queue instead of leaving missing data ambiguous</li>
          </ul>
        </article>

        <article className="panel">
          <h2>Known gaps</h2>
          <ul className="checklist">
            <li>Several tracked supporting sources are still monitoring-only and need venue-specific parser coverage</li>
            <li>Manual ingestion config is still JSON-backed and not editable through the UI yet</li>
            <li>The failure queue is derived from latest snapshots today rather than a dedicated persistent incident table</li>
          </ul>
        </article>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Event contract</h2>
          <ul className="checklist">
            <li>Each event stores the change type, milestone identity, before-and-after values, and field-level deltas</li>
            <li>Events are keyed to the exact source snapshot plus venue, edition, track, and source authority metadata</li>
            <li>Feeds, venue history views, and alerts can read durable rows instead of reparsing snapshot envelopes</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
