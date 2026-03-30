"use client";

import { useEffect, useRef, useState } from "react";
import {
  readWorkflowAnalyticsSummary,
  recordWorkflowEvent,
  subscribeToWorkflowAnalytics,
  type WorkflowAdoptionSummary
} from "@/lib/workflow-analytics";

type WorkflowAdoptionProps = {
  rollout: {
    blocked: number;
    atRisk: number;
    waitingReview: number;
    waitingApproval: number;
  };
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

function formatRate(value: number | null) {
  if (value === null) {
    return "No filter sessions yet";
  }

  return `${Math.round(value * 100)}%`;
}

export function WorkflowAdoption({ rollout }: WorkflowAdoptionProps) {
  const [summary, setSummary] = useState<WorkflowAdoptionSummary | null>(null);
  const hasRecordedOpen = useRef(false);

  useEffect(() => {
    if (!hasRecordedOpen.current) {
      hasRecordedOpen.current = true;
      recordWorkflowEvent("workspace_opened", window.location.pathname, {
        blockedQueue: rollout.blocked,
        atRiskQueue: rollout.atRisk,
        waitingReviewQueue: rollout.waitingReview,
        waitingApprovalQueue: rollout.waitingApproval
      });
    }

    setSummary(readWorkflowAnalyticsSummary());

    return subscribeToWorkflowAnalytics(() => {
      setSummary(readWorkflowAnalyticsSummary());
    });
  }, [rollout.atRisk, rollout.blocked, rollout.waitingApproval, rollout.waitingReview]);

  return (
    <section className="grid analytics-grid">
      <article className="panel">
        <div className="panel-heading">
          <h2>Workflow adoption</h2>
          <span>{summary ? `${summary.trackedSessions} tracked sessions` : "Initializing"}</span>
        </div>
        {summary ? (
          <>
            <div className="metric-grid">
              <article className="metric-card">
                <span>Search to save</span>
                <strong>{formatRate(summary.searchToSaveConversion)}</strong>
                <p className="trust-copy">
                  {summary.sessionsWithSavedViews}/{summary.sessionsWithFiltering} filtered sessions created a watchlist.
                </p>
              </article>

              <article className="metric-card">
                <span>Repeat returns</span>
                <strong>{summary.returnVisits}</strong>
                <p className="trust-copy">Return sessions after the first workflow visit.</p>
              </article>

              <article className="metric-card">
                <span>Alert-ready watchlists</span>
                <strong>{summary.alertConfiguredCount}</strong>
                <p className="trust-copy">Saved views with an explicit notification window attached.</p>
              </article>

              <article className="metric-card">
                <span>Feed and history opens</span>
                <strong>{summary.changeFeedOpenCount + summary.venueHistoryOpenCount}</strong>
                <p className="trust-copy">Re-opened venue history plus change-feed drilldowns from the UI.</p>
              </article>
            </div>

            <div className="workflow-card">
              <div className="badge-row">
                <span className={`status-badge tone-${summary.replacementState.tone}`}>{summary.replacementState.label}</span>
                <span className="status-badge tone-neutral">{summary.manualTrackingSignals} replacement signals</span>
              </div>
              <p className="trust-copy">{summary.replacementState.detail}</p>
              <div className="provenance-stack">
                <span>{summary.savedViewCount} total watchlists saved</span>
                <span>{summary.compareLaunchCount} compare-mode launches</span>
                <span>{summary.exportReadiness.detail}</span>
                <span>
                  Latest activity:{" "}
                  {summary.latestActivityAt ? dateFormatter.format(new Date(summary.latestActivityAt)) : "No activity yet"}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="empty-state">Open the discovery workspace, save a view, or inspect venue history to seed adoption metrics.</p>
        )}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <h2>Rollout summary</h2>
          <span>Phase 2 queue state</span>
        </div>
        <ul className="checklist">
          <li>
            <span>Blocked</span>
            <strong>{rollout.blocked}</strong>
          </li>
          <li>
            <span>At risk</span>
            <strong>{rollout.atRisk}</strong>
          </li>
          <li>
            <span>Waiting for review</span>
            <strong>{rollout.waitingReview}</strong>
          </li>
          <li>
            <span>Waiting for approval</span>
            <strong>{rollout.waitingApproval}</strong>
          </li>
        </ul>
        <p className="trust-copy">
          Waiting-for-approval rows are manual-tracking leftovers: deadlines still rendered without a verified source snapshot.
        </p>
      </article>
    </section>
  );
}
