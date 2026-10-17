import { ButtonLink } from "@/components/ui/Button";
import { FriendlyError } from "@/components/ui/FriendlyError";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 items-center px-4">
      <FriendlyError
        title="This page wandered off."
        message="We couldn't find that page. Maybe it fell down a rabbit hole?"
        action={<ButtonLink href="/">Back to the library</ButtonLink>}
      />
    </main>
  );
}
