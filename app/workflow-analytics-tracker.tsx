"use client";

import { useEffect, useRef } from "react";
import { recordWorkflowEvent, type WorkflowEventName } from "@/lib/workflow-analytics";

type WorkflowAnalyticsTrackerProps = {
  eventName: WorkflowEventName;
  metadata?: Record<string, number | string | boolean | null>;
};

export function WorkflowAnalyticsTracker({ eventName, metadata }: WorkflowAnalyticsTrackerProps) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (hasTracked.current) {
      return;
    }

    hasTracked.current = true;
    recordWorkflowEvent(eventName, window.location.pathname, metadata);
  }, [eventName, metadata]);

  return null;
}
