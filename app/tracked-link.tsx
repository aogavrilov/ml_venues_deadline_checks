"use client";

import type { AnchorHTMLAttributes } from "react";
import { recordWorkflowEvent, type WorkflowEventName } from "@/lib/workflow-analytics";

type TrackedLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  eventName: WorkflowEventName;
  eventMetadata?: Record<string, number | string | boolean | null>;
};

export function TrackedLink({ eventName, eventMetadata, onClick, href, ...props }: TrackedLinkProps) {
  return (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        recordWorkflowEvent(eventName, window.location.pathname, eventMetadata);
      }}
    />
  );
}
