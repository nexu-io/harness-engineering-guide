import TableOfContents from "./TableOfContents";
import Link from "next/link";

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

interface PrevNext {
  slug: string;
  title: string;
}

interface ArticleLayoutProps {
  title: string;
  description?: string;
  author?: string;
  category?: string;
  date?: string;
  originalUrl?: string;
  contentHtml: string;
  headings: HeadingItem[];
  prev?: PrevNext | null;
  next?: PrevNext | null;
  prevPrefix?: string;
  nextPrefix?: string;
  sidebar?: React.ReactNode;
}

export default function ArticleLayout({
  title,
  author,
  category,
  date,
  originalUrl,
  contentHtml,
  headings,
  prev,
  next,
  prevPrefix = "/guide",
  nextPrefix = "/guide",
  sidebar,
}: ArticleLayoutProps) {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-12">
          {/* Optional sidebar (guide chapters) */}
          {sidebar && (
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="sticky top-24">{sidebar}</div>
            </aside>
          )}

          {/* Main content */}
          <article className="flex-1 min-w-0 max-w-3xl animate-fade-in-up">
            {/* Meta header */}
            <header className="mb-8">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {category && (
                  <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-[var(--color-accent-cyan-dim)] text-[var(--color-accent-cyan)] border border-[var(--color-accent-cyan)]/30">
                    {category}
                  </span>
                )}
                {author && (
                  <span className="text-sm text-[var(--color-text-secondary)]">{author}</span>
                )}
                {date && (
                  <span className="text-sm text-[var(--color-text-muted)]">{date}</span>
                )}
              </div>
              {originalUrl && (
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent-cyan)] transition-colors mb-4"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View Original
                </a>
              )}
            </header>

            {/* Article body */}
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />

            {/* Prev/Next navigation */}
            {(prev || next) && (
              <nav className="mt-16 pt-8 border-t border-[var(--color-border)] flex justify-between gap-4">
                {prev ? (
                  <Link
                    href={`${prevPrefix}/${prev.slug}`}
                    className="group flex flex-col items-start gap-1 text-left"
                  >
                    <span className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-cyan)] transition-colors">
                      ← Previous
                    </span>
                    <span className="text-sm font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors">
                      {prev.title}
                    </span>
                  </Link>
                ) : (
                  <div />
                )}
                {next ? (
                  <Link
                    href={`${nextPrefix}/${next.slug}`}
                    className="group flex flex-col items-end gap-1 text-right"
                  >
                    <span className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-cyan)] transition-colors">
                      Next →
                    </span>
                    <span className="text-sm font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors">
                      {next.title}
                    </span>
                  </Link>
                ) : (
                  <div />
                )}
              </nav>
            )}
          </article>

          {/* ToC sidebar */}
          <div className="w-56 shrink-0 hidden xl:block">
            <TableOfContents headings={headings} />
          </div>
        </div>
      </div>
    </div>
  );
}
