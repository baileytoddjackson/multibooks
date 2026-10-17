import { FeedbackLink } from "./FeedbackLink";
import { SessionCodeField } from "./SessionCodeField";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <SessionCodeField />
        <div className="flex items-center gap-4 text-sm text-ink-soft">
          <span>Classic texts from Project Gutenberg</span>
          <FeedbackLink />
        </div>
      </div>
    </footer>
  );
}
