import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkflowAnalyticsTracker } from "../../workflow-analytics-tracker";
import { getVenueDeadlineDetail, getVenueSlugs } from "@/lib/deadlines";

type VenuePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await getVenueSlugs();

  return slugs.map((slug) => ({ slug }));
}

export default async function VenuePage({ params }: VenuePageProps) {
  const { slug } = await params;
  const venue = await getVenueDeadlineDetail(slug);

  if (!venue) {
    notFound();
  }

  const latestEdition = venue.editions[0] ?? null;

  return (
    <main className="page-shell">
      <WorkflowAnalyticsTracker eventName="venue_history_opened" metadata={{ venueSlug: venue.slug, source: "detail_page" }} />
      <section className="hero">
        <p className="eyebrow">Venue Detail</p>
        <h1>{venue.name}</h1>
        <p className="lede">
          {venue.series}. Canonical timezone: {venue.timezone}. The current slice
          normalizes official deadline milestones from the conference dates page
          template and keeps direct provenance back to the fetched source snapshot.
        </p>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>{latestEdition ? latestEdition.label : "No imported editions yet"}</h2>
            <Link href="/">Back to deadline index</Link>
          </div>

          {latestEdition ? (
            <div className="deadline-stack">
              {latestEdition.deadlines.map((deadline) => (
                <div key={deadline.id} className="deadline-card">
                  <div className="badge-row">
                    <span className={`status-badge tone-${deadline.trust.tone}`}>{deadline.trust.label}</span>
                    {deadline.change ? (
                      <span className={`status-badge tone-${deadline.change.tone}`}>{deadline.change.label}</span>
                    ) : null}
                    <span className={`status-badge tone-${deadline.parser.tone}`}>{deadline.parser.label}</span>
                    <span className="status-badge tone-neutral">{deadline.sourceTypeLabel}</span>
                  </div>
                  <div>
                    <p className="deadline-name">{deadline.name}</p>
                    <p className="deadline-meta">
                      {deadline.trackName ?? "All tracks"} · {deadline.kind}
                    </p>
                  </div>
                  <div className="deadline-timing">
                    <strong>{dateFormatter.format(deadline.dueAt)}</strong>
                    <span>{deadline.isHard ? "Hard deadline" : "Milestone"}</span>
                  </div>
                  <div className="provenance-stack">
                    <span>Source snapshot: {deadline.sourceKey ?? "Manual entry"}</span>
                    <span>Parser: {deadline.parser.parserName ?? deadline.parser.label}</span>
                    <span>{deadline.trust.detail}</span>
                    <span>{deadline.parser.detail}</span>
                  </div>
                  {deadline.notes ? <p className="deadline-note">{deadline.notes}</p> : null}
                  <p className="source-note">
                    Last verified{" "}
                    {deadline.lastVerifiedAt
                      ? dateFormatter.format(deadline.lastVerifiedAt)
                      : "unknown"}
                    {deadline.sourceUrl ? (
                      <>
                        {" "}
                        via{" "}
                        <a href={deadline.sourceUrl} target="_blank" rel="noreferrer">
                          {deadline.sourceKey}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state-stack">
              <p className="empty-state">
                No normalized deadlines are live for this venue yet. The source list below still
                shows whether the venue is monitored, changed, or missing parser coverage.
              </p>
            </div>
          )}
        </article>

        <article className="panel">
          <h2>Source coverage</h2>
          <ul className="source-list">
            {venue.sources.map((source) => (
              <li key={source.key}>
                <div className="list-main">
                  <div className="badge-row">
                    <span className={`status-badge tone-${source.trust.tone}`}>{source.trust.label}</span>
                    {source.change ? (
                      <span className={`status-badge tone-${source.change.tone}`}>{source.change.label}</span>
                    ) : null}
                    <span className={`status-badge tone-${source.parser.tone}`}>{source.parser.label}</span>
                    <span className="status-badge tone-neutral">
                      {source.isCanonical ? "Canonical" : "Supporting"}
                    </span>
                  </div>
                  <strong>{source.key}</strong>
                  <p>{source.notes}</p>
                  <div className="provenance-stack">
                    <span>{source.kind} source</span>
                    <span>Parser: {source.parser.parserName ?? source.parser.label}</span>
                    <span>{source.trust.detail}</span>
                    <span>{source.parser.detail}</span>
                  </div>
                  {source.errorMessage ? <p className="warning-copy">{source.errorMessage}</p> : null}
                </div>
                <div className="source-meta">
                  <span>{source.lastVerifiedAt ? dateFormatter.format(source.lastVerifiedAt) : "Not verified yet"}</span>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>Venue history</h2>
            <span>{venue.history.length} recent events</span>
          </div>
          {venue.history.length > 0 ? (
            <ul className="source-list">
              {venue.history.map((event) => (
                <li key={event.id}>
                  <div className="list-main">
                    <div className="badge-row">
                      <span className={`status-badge tone-${event.summary.tone}`}>{event.summary.label}</span>
                      <span className="status-badge tone-neutral">{event.sourceAuthority}</span>
                      <span className="status-badge tone-neutral">{event.milestoneKind}</span>
                    </div>
                    <strong>{event.milestoneName}</strong>
                    <p className="trust-copy">{event.summary.detail}</p>
                    <div className="provenance-stack">
                      <span>Source: {event.sourceKey}</span>
                      <span>
                        {event.editionLabel ?? "Unknown edition"}
                        {event.trackName ? ` · ${event.trackName}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="source-meta">
                    <span>{dateFormatter.format(new Date(event.detectedAt))}</span>
                    <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                      Open source
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No durable change history is stored for this venue yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}
