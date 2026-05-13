import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-2xl font-semibold tracking-tight"
      >
        <span
          aria-hidden
          className="inline-block h-8 w-8 rounded-full bg-accent shadow-button"
        />
        Yelli
      </Link>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-xs text-muted-foreground">Speed dial for your team.</p>
    </div>
  );
}
