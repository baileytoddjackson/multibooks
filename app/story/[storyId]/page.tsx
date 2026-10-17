import type { Metadata } from "next";
import { Suspense } from "react";
import { StoryReader } from "@/components/create/StoryReader";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "My story" };

/** Created stories live on the device (localStorage), so the page itself is a client shell. */
export default function StoryPage(props: PageProps<"/story/[storyId]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-paper" aria-busy="true" />}>
      <Story params={props.params} />
    </Suspense>
  );
}

async function Story({ params }: { params: PageProps<"/story/[storyId]">["params"] }) {
  const { storyId } = await params;
  const { CYO_SOFT_TURN_CAP, CYO_HARD_TURN_CAP } = env();
  return <StoryReader storyId={storyId} softCap={CYO_SOFT_TURN_CAP} hardCap={CYO_HARD_TURN_CAP} />;
}
