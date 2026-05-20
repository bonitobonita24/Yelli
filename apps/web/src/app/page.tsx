import { Button } from "@yelli/ui/button";
import Link from "next/link";

import { getLandingCTAs } from "@/lib/landing/cta";
import { auth } from "@/server/auth";

export default async function RootPage() {
  const session = await auth();
  const ctas = getLandingCTAs({ isAuthed: Boolean(session?.user) });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Yelli
          </Link>
          <nav className="flex items-center gap-2">
            {ctas.secondary && (
              <Button asChild variant="ghost" size="sm">
                <Link href={ctas.secondary.href}>{ctas.secondary.label}</Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href={ctas.primary.href}>{ctas.primary.label}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Real-time team comms,
            <br />
            built for SaaS organizations.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Speed-dial intercom, group meetings, and recordings — one workspace
            per organization, with role-based access and audit trails out of
            the box.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={ctas.primary.href}>{ctas.primary.label}</Link>
            </Button>
            {ctas.secondary && (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
              >
                <Link href={ctas.secondary.href}>{ctas.secondary.label}</Link>
              </Button>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6 text-sm text-muted-foreground">
          <span>© 2026 Powerbyte</span>
          <span>Yelli</span>
        </div>
      </footer>
    </div>
  );
}
