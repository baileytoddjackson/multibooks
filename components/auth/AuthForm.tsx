"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { safeNextPath } from "@/lib/auth/constants";

type Mode = "login" | "signup";

const MESSAGES: Record<string, string> = {
  bad_code: "That access code isn't right. Check your invite link or ask whoever invited you.",
  signup_closed: "Sign-up isn't open right now.",
  email_taken: "There's already an account with that email. Try signing in instead.",
  bad_credentials: "That email and password don't match an account.",
  slow_down: "Too many tries. Wait a minute, then try again.",
};

const INPUT =
  "min-h-12 w-full rounded-xl border-2 border-line bg-card px-4 text-base focus-visible:border-teal focus-visible:outline-none";

/**
 * Sign-in and sign-up form. Sign-up needs the shared access code; an invite link carries it as
 * `?code=…`, which fills in the field and is then removed from the address bar.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const ids = { email: useId(), password: useId(), code: useId(), error: useId() };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(() => params.get("code") ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const next = safeNextPath(params.get("next"));

  // Keep the access code out of browser history once it's in the form.
  useEffect(() => {
    if (!params.has("code")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    window.history.replaceState(null, "", url);
  }, [params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup" ? { email, password, accessCode: code } : { email, password },
        ),
      });
      if (res.ok) {
        // A full navigation so the new session's data loads fresh.
        window.location.assign(next);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      setError(
        MESSAGES[body.error ?? ""] ?? body.message ?? "Something went wrong. Please try again.",
      );
    } catch {
      setError("We couldn't reach MultiBooks. Check your connection and try again.");
    }
    setBusy(false);
  };

  const otherHref = (path: string) =>
    next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.email} className="font-semibold">
          Email
        </label>
        <input
          id={ids.email}
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? ids.error : undefined}
          className={INPUT}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.password} className="font-semibold">
          Password
        </label>
        <input
          id={ids.password}
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 8 : 1}
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? ids.error : undefined}
          className={INPUT}
        />
        {mode === "signup" && <p className="text-sm text-ink-soft">At least 8 characters.</p>}
      </div>

      {mode === "signup" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.code} className="font-semibold">
            Access code
          </label>
          <input
            id={ids.code}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={100}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-describedby={error ? ids.error : undefined}
            className={`${INPUT} uppercase`}
          />
          <p className="text-sm text-ink-soft">It&apos;s in your invite link.</p>
        </div>
      )}

      {error && (
        <p
          id={ids.error}
          role="alert"
          className="rounded-xl bg-coral/10 px-4 py-3 text-coral-strong ring-1 ring-coral/30"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="min-h-12 rounded-full bg-teal px-6 font-semibold text-white hover:bg-teal-strong disabled:opacity-50"
      >
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-ink-soft">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href={otherHref("/login")} className="font-semibold text-teal-strong underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Got an invite?{" "}
            <Link href={otherHref("/signup")} className="font-semibold text-teal-strong underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
