import type { Metadata } from "next";
import { Suspense } from "react";
import { StoryReader } from "@/components/create/StoryReader";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "My story" };

/** Create Your Own and Adventure Mode stories both open here. */

/** Stories are loaded by the client store (from the reader's account), so this is a client shell. */
export default function StoryPage(props: PageProps<"/story/[storyId]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-paper" aria-busy="true" />}>
      <Story params={props.params} />
    </Suspense>
  );
}

async function Story({ params }: { params: PageProps<"/story/[storyId]">["params"] }) {
  const { storyId } = await params;
  const e = env();
  return (
    <StoryReader
      storyId={storyId}
      caps={{
        cyo: { soft: e.CYO_SOFT_TURN_CAP, hard: e.CYO_HARD_TURN_CAP },
        adventure: { soft: e.ADVENTURE_SOFT_TURN_CAP, hard: e.ADVENTURE_HARD_TURN_CAP },
      }}
    />
  );
}
