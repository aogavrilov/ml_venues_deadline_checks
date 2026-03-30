import Link from "next/link";
import { getMonitorHealth } from "@/lib/deadlines";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

function QueuePanel({
  title,
  items
}: {
  title: string;
  items: Awaited<ReturnType<typeof getMonitorHealth>>["queue"]["blocked"];
}) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{items.length} items</span>
      </div>
      {items.length > 0 ? (
        <ul className="source-list">
          {items.map((item) => (
            <li key={`${title}:${item.venueSlug}:${item.sourceKey}:${item.issueType}`}>
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
        <p className="empty-state">No items are currently queued here.</p>
      )}
    </article>
  );
}

export default async function HealthPage() {
  const health = await getMonitorHealth();

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">Health</p>
        <h1>Source health overview</h1>
        <p className="lede">
          Checked {dateFormatter.format(health.checkedAt)} across {health.sourceCount} tracked sources. This view splits
          source issues into blocked, at-risk, and waiting-for-review queues and mirrors the venue coverage board shown
          on the home page.
        </p>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Current state counts</h2>
          <ul className="checklist">
            {Object.entries(health.sourcesByState).map(([state, count]) => (
              <li key={state}>
                <span>{state.replaceAll("_", " ")}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Venue coverage summary</h2>
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

      <section className="grid">
        <QueuePanel title="Blocked queue" items={health.queue.blocked} />
        <QueuePanel title="Waiting for review" items={health.queue.waitingReview} />
      </section>

      <section className="grid">
        <QueuePanel title="At-risk queue" items={health.queue.atRisk} />

        <article className="panel">
          <div className="panel-heading">
            <h2>Venue coverage board</h2>
            <span>{health.venues.length} venues</span>
          </div>
          <ul className="source-list">
            {health.venues.map((venue) => (
              <li key={venue.slug}>
                <div className="list-main">
                  <div className="badge-row">
                    <span className={`status-badge tone-${venue.coverage.tone}`}>{venue.coverage.label}</span>
                    <span className={`status-badge tone-${venue.freshness.tone}`}>{venue.freshness.label}</span>
                  </div>
                  <strong>{venue.name}</strong>
                  <div className="provenance-stack">
                    <span>{venue.deadlineCount} imported deadlines</span>
                    <span>{venue.coveredSourceCount} parser-backed sources</span>
                    <span>{venue.monitoringSourceCount} monitoring-only sources</span>
                  </div>
                </div>
                <Link href={`/venues/${venue.slug}`}>Inspect venue</Link>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
