import Link from "next/link";
import { getDeadlineIndex } from "@/lib/deadlines";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

export default async function HomePage() {
  const { deadlines, venueSummary } = await getDeadlineIndex();
  const spotlightDeadlines = deadlines.slice(0, 6);

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">A* Conference Deadline Monitor</p>
        <h1>Official-source deadline ingestion with provenance-backed public views.</h1>
        <p className="lede">
          The current ingestion slice fetches official conference dates pages,
          normalizes canonical deadlines into the database, and exposes them with
          source verification metadata plus snapshot change signals.
        </p>
      </section>

      <section className="grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>Public deadline index</h2>
            <span>{deadlines.length} imported milestones</span>
          </div>
          <ul className="venue-list">
            {spotlightDeadlines.map((deadline) => (
              <li key={deadline.id}>
                <div>
                  <strong>{deadline.name}</strong>
                  <span>
                    {deadline.venueName} · {deadline.editionLabel}
                  </span>
                </div>
                <div className="list-side">
                  <strong>{dateFormatter.format(deadline.dueAt)}</strong>
                  <span>
                    {deadline.lastVerifiedAt
                      ? `Verified ${dateFormatter.format(deadline.lastVerifiedAt)}`
                      : "Verification pending"}
                  </span>
                  <Link href={`/venues/${deadline.venueSlug}`}>Open venue</Link>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Venue coverage</h2>
          <ul className="checklist">
            {venueSummary.map((venue) => (
              <li key={venue.slug}>
                <div>
                  <strong>{venue.name}</strong>
                  <span>
                    {venue.deadlineCount} imported deadlines · {venue.sourceCount} sources
                  </span>
                </div>
                <Link href={`/venues/${venue.slug}`}>Inspect venue</Link>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid lower-grid">
        <article className="panel">
          <h2>What shipped in this increment</h2>
          <ul className="checklist">
            <li>Fetched raw HTML snapshots from the official ICLR, NeurIPS, ICML, and CVPR 2026 dates pages</li>
            <li>Normalized canonical deadlines into Prisma with source provenance for all four venues</li>
            <li>Moved common milestone matching into a shared conference dates parser instead of exact row-name overrides</li>
            <li>Added fetch-time change signals so repeated snapshots show whether the source content changed</li>
          </ul>
        </article>

        <article className="panel">
          <h2>Known gaps</h2>
          <ul className="checklist">
            <li>ACL and EMNLP still rely on registry-only metadata until they get official date sources or venue-specific parsers</li>
            <li>Change detection is hash-based today and does not yet classify which milestones moved</li>
            <li>Manual ingestion config is still JSON-backed and not editable through the UI yet</li>
            <li>Next parser targets are ACL, EMNLP, and any venue that does not use the shared conference-site template</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
