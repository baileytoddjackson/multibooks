import type { BookMeta } from "@/lib/schemas/content";

type Motif = BookMeta["cover"]["motif"] | "quill";

/** Generated placeholder cover: a gradient plus a simple line motif. No copyrighted art. */
export function CoverArt({
  from,
  to,
  motif,
  id,
  className = "",
}: {
  from: string;
  to: string;
  motif: Motif;
  id: string;
  className?: string;
}) {
  const gradId = `cover-grad-${id}`;
  return (
    <svg
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="300" height="200" fill={`url(#${gradId})`} />
      <circle cx="250" cy="30" r="60" fill="white" opacity="0.08" />
      <circle cx="40" cy="190" r="80" fill="white" opacity="0.06" />
      <g fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {MOTIFS[motif]}
      </g>
    </svg>
  );
}

const MOTIFS: Record<Motif, React.ReactNode> = {
  watch: (
    <>
      <circle cx="150" cy="110" r="46" />
      <circle cx="150" cy="110" r="38" opacity="0.5" strokeWidth="2" />
      <path d="M150 110 L150 82 M150 110 L170 120" />
      <path d="M150 64 L150 52 M140 50 h20" />
      <path d="M160 46 C 200 20, 240 40, 255 20" opacity="0.6" strokeDasharray="2 9" />
    </>
  ),
  sail: (
    <>
      <path d="M150 40 L150 140 M150 46 L200 128 L150 128 Z M146 56 L112 124 L146 124" />
      <path d="M110 146 L190 146 L178 160 L122 160 Z" />
      <path d="M40 172 q 20 -12 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" opacity="0.7" />
    </>
  ),
  whale: (
    <>
      <path d="M150 140 C 150 110, 140 90, 112 72 C 130 74, 146 84, 150 98 C 154 84, 170 74, 188 72 C 160 90, 150 110, 150 140" />
      <path d="M30 150 q 20 -12 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" opacity="0.8" />
      <path d="M50 172 q 20 -12 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" opacity="0.5" />
    </>
  ),
  quill: (
    <>
      <path d="M118 150 C 140 110, 170 70, 210 46 C 200 90, 168 124, 126 146" />
      <path d="M126 146 L 104 168" />
      <path d="M150 116 L 176 92" opacity="0.6" strokeWidth="3" />
      <path d="M92 172 h 50" opacity="0.6" strokeDasharray="2 10" />
      <path d="M210 112 l6 -14 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6 Z" strokeWidth="3" />
    </>
  ),
};
