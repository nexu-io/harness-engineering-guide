import { getAllContent } from "@/lib/content";

export const metadata = {
  title: "Changelog | Harness Guide",
  description: "Daily updates and changes to the Harness Engineering Guide",
};

export default async function ChangelogPage() {
  const entries = await getAllContent("changelog");
  const sorted = entries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-24 pb-16">
      <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold text-[var(--color-text-primary)] mb-2">
        Changelog
      </h1>
      <p className="text-[var(--color-text-secondary)] mb-12">
        Daily updates and changes to the Harness Engineering Guide.
      </p>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--color-border)]" />

        <div className="space-y-12">
          {sorted.map((entry) => (
            <article key={entry.slug} className="relative pl-8">
              {/* Timeline dot */}
              <div className="absolute left-0 top-2 w-[15px] h-[15px] rounded-full bg-[var(--color-accent-cyan)] border-2 border-[var(--color-bg-primary)]" />

              <time className="text-sm font-mono text-[var(--color-accent-cyan)] mb-1 block">
                {entry.date}
              </time>
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-4">
                {entry.title}
              </h2>
              <div
                className="prose-custom text-[var(--color-text-secondary)]"
                dangerouslySetInnerHTML={{ __html: entry.contentHtml }}
              />
            </article>
          ))}
        </div>
      </div>

      {sorted.length === 0 && (
        <p className="text-[var(--color-text-muted)] text-center py-20">
          No changelog entries yet. Check back soon!
        </p>
      )}
    </div>
  );
}
