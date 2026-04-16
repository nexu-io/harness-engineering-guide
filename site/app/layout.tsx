import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Navigation from "@/components/Navigation";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Harness Engineering Guide",
  description:
    "The open guide to building AI agent runtimes. From core concepts to production patterns.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] transition-colors duration-300">
        <ThemeProvider>
        {/* Noise texture overlay */}
        <div className="noise-overlay" />

        <Navigation />

        <main className="flex-1">{children}</main>

        <footer className="border-t border-[var(--color-border)] bg-[var(--color-bg-primary)] transition-colors duration-300">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <p className="text-sm font-[family-name:var(--font-heading)] font-semibold text-[var(--color-text-primary)] mb-1">
                  Harness Engineering Guide
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  An open-source knowledge base for building AI agent runtimes.
                </p>
              </div>
              <div className="flex items-center gap-6 text-xs text-[var(--color-text-muted)]">
                <a
                  href="https://github.com/nexu-io/harness-engineering-guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--color-accent-cyan)] transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://x.com/nexudotio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--color-accent-cyan)] transition-colors"
                >
                  Twitter
                </a>
                <span className="text-[var(--color-border)]">|</span>
                <span>
                  Powered by{" "}
                  <a
                    href="https://nexu.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    nexu
                  </a>
                </span>
              </div>
            </div>
          </div>
        </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
