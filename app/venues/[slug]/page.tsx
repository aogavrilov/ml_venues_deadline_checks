import Link from "next/link";
import { notFound } from "next/navigation";
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
                  <p className="deadline-note">{deadline.notes}</p>
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
            <p className="empty-state">Run the ingestion worker to materialize deadlines for this venue.</p>
          )}
        </article>

        <article className="panel">
          <h2>Source coverage</h2>
          <ul className="source-list">
            {venue.sources.map((source) => (
              <li key={source.key}>
                <div>
                  <strong>{source.key}</strong>
                  <p>{source.notes}</p>
                </div>
                <div className="source-meta">
                  <span>{source.kind}</span>
                  <span>{source.isCanonical ? "canonical" : "supporting"}</span>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    open source
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
