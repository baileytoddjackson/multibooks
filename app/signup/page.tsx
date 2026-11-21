import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      intro="MultiBooks is invite-only for now. Your invite link fills in the access code."
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
