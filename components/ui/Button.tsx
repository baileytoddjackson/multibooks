import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "plum";

const BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-coral-strong text-white hover:bg-[#a9381f]",
  plum: "bg-plum text-white hover:bg-[#5a3f83]",
  secondary: "border-2 border-ink/15 bg-card text-ink hover:border-ink/30 hover:bg-paper-deep",
  ghost: "text-ink hover:bg-ink/5",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `${BASE} ${VARIANTS[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
