import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" intro="Sign in to pick up your stories where you left off.">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
