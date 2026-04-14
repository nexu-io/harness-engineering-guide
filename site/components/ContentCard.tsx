import Link from "next/link";

interface ContentCardProps {
  href: string;
  title: string;
  description: string;
  author?: string;
  category?: string;
}

export default function ContentCard({
  href,
  title,
  description,
  author,
  category,
}: ContentCardProps) {
  return (
    <Link href={href} className="group block">
      <article className="h-full p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] transition-all duration-300 group-hover:border-[var(--color-accent-cyan)]/30 group-hover:bg-[var(--color-bg-card-hover)] glow-cyan-hover">
        <div className="flex flex-col h-full">
          {category && (
            <span className="self-start px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded bg-[var(--color-accent-cyan-dim)] text-[var(--color-accent-cyan)] mb-3">
              {category}
            </span>
          )}
          <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[var(--color-text-primary)] mb-2 group-hover:text-[var(--color-accent-cyan)] transition-colors leading-snug">
            {title}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed line-clamp-3 flex-1 mb-3">
            {description}
          </p>
          {author && (
            <p className="text-xs text-[var(--color-text-muted)] mt-auto">{author}</p>
          )}
        </div>
      </article>
    </Link>
  );
}
