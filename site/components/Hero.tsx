import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
      {/* Animated grid background */}
      <div className="absolute inset-0 hero-grid" />

      {/* Radial gradient overlay */}
      <div className="absolute inset-0 hero-radial" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        {/* Tag */}
        <div className="animate-fade-in-up stagger-1">
          <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-[var(--color-accent-cyan)] bg-[var(--color-accent-cyan-dim)] border border-[var(--color-accent-cyan)]/25 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-cyan)] animate-pulse" />
            Open Source Knowledge Base
          </span>
        </div>

        {/* Title */}
        <h1 className="animate-fade-in-up stagger-2 font-[family-name:var(--font-heading)] text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
          <span className="text-[var(--color-text-primary)]">Harness</span>
          <br />
          <span className="bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-cyan)]/60 bg-clip-text text-transparent">
            Engineering
          </span>
          <br />
          <span className="text-[var(--color-text-primary)]">Guide</span>
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-in-up stagger-3 text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
          The open guide to building AI agent runtimes.
          <br className="hidden sm:block" />
          From core concepts to production patterns.
        </p>

        {/* Stats */}
        <div className="animate-fade-in-up stagger-4 flex flex-wrap justify-center gap-6 mb-10 text-sm text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[var(--color-accent-cyan)]" />
            14 Tutorials
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[var(--color-accent-amber)]" />
            4 Core Concepts
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[var(--color-accent-cyan)]" />
            5 Practice Guides
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[var(--color-accent-amber)]" />
            Real Code Examples
          </span>
        </div>

        {/* CTAs */}
        <div className="animate-fade-in-up stagger-5 flex flex-wrap justify-center gap-4">
          <Link
            href="/guide/what-is-harness"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[var(--color-accent-cyan)] rounded-lg hover:opacity-90 transition-all hover:shadow-[0_0_30px_var(--color-accent-cyan-dim)]"
          >
            Start Reading
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <a
            href="https://github.com/nexu-io/harness-engineering-guide"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] transition-all"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub ★
          </a>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 hero-bottom-fade" />
    </section>
  );
}
