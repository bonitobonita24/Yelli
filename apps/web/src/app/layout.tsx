import { Toaster } from "@yelli/ui/toaster";
import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/lib/trpc/react";

import type { Metadata } from "next";

import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Yelli", template: "%s · Yelli" },
  description: "Speed dial intercom + video meetings for distributed teams.",
  icons: { icon: "/favicon.ico" },
  // Prevent indexing on staging/internal deployments — prod overrides via env-based metadata
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* LiveKit prefab styles served as static asset — see globals.css for rationale. */}
        <link rel="stylesheet" href="/livekit-styles.css" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <TRPCReactProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
