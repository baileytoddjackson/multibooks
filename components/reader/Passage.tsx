import type { Paragraph } from "@/lib/schemas/content";
import { emphasisRuns } from "@/lib/reader/progress";

function Runs({ text }: { text: string }) {
  return <>{emphasisRuns(text).map((r, i) => (r.em ? <em key={i}>{r.text}</em> : r.text))}</>;
}

/** Renders canon paragraphs: prose, verse (line breaks kept), and scene breaks. */
export function Passage({ paragraphs }: { paragraphs: Paragraph[] }) {
  return (
    <>
      {paragraphs.map((p) => {
        if (p.kind === "break") {
          return (
            <p
              key={p.id}
              className="py-2 text-center tracking-[1em] text-[var(--reader-muted)]"
              aria-hidden="true"
            >
              ⁂
            </p>
          );
        }
        if (p.kind === "verse") {
          return (
            <p key={p.id} id={p.id} className="pl-[1.5em] whitespace-pre-wrap italic">
              <Runs text={p.text} />
            </p>
          );
        }
        return (
          <p key={p.id} id={p.id}>
            <Runs text={p.text} />
          </p>
        );
      })}
    </>
  );
}
