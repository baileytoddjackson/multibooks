"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { EventProps, EventType } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";

/** A Next.js Link that records an analytics event when followed (usable from server components). */
export function TrackedLink<T extends EventType>({
  event,
  eventProps,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { event: T; eventProps: EventProps<T> }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track(event, eventProps);
        onClick?.(e);
      }}
    />
  );
}
