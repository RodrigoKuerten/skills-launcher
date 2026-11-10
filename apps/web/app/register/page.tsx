import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="container-page flex min-h-[calc(100vh-8rem)] items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">A library, update tracking and companion pairing tokens.</p>

        {error ? (
          <div className="mt-4 rounded-lg border border-danger/25 bg-danger/5 p-3 text-xs text-danger">
            {error === "exists"
              ? "An account with that email already exists."
              : error === "weak"
                ? "Use a password with at least 8 characters."
                : "Could not create the account."}
          </div>
        ) : null}

        <form action="/api/auth/register" method="post" className="mt-6 space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" required maxLength={80} placeholder="Your name" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={200}
              placeholder="At least 8 characters"
            />
          </div>
          <Button type="submit" className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-6 text-[10px] leading-relaxed text-muted-foreground">
          Accounts are for saving skills and reporting issues. Installing skills does not require an account — the local
          companion works standalone.
        </p>
      </div>
    </div>
  );
}
