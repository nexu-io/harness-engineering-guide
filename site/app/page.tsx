import Hero from "@/components/Hero";
import Link from "next/link";
import { guideSections } from "@/lib/guide-data";

export default function HomePage() {
  return (
    <div>
      <Hero />

      {/* Guide Sections */}
      {guideSections.map((section) => (
        <section
          key={section.id}
          className="py-16 border-t border-[var(--color-border)]"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-8 h-px bg-[var(--color-accent-cyan)]" />
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-cyan)]">
                {section.label}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
              {section.items.map((item) => (
                <Link
                  key={item.slug}
                  href={`/guide/${item.slug}`}
                  className="group block p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-card-hover)] transition-all"
                >
                  <h3 className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-cyan)] transition-colors">
                    {item.title}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Community Links */}
      <section className="py-20 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text-primary)] mb-8">
            Join the Community
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://github.com/nexu-io/harness-engineering-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </a>
            <a
              href="https://x.com/nexudotio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Twitter
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
