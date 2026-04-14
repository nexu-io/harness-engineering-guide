import ContentCard from "@/components/ContentCard";
import { getAllContent } from "@/lib/content";

export const metadata = {
  title: "News | Harness Guide",
  description: "Latest news and updates from the Harness Engineering ecosystem.",
};

export default async function NewsPage() {
  const news = await getAllContent("news");

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-8 h-px bg-[var(--color-accent-amber)]" />
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-amber)]">
          News
        </span>
      </div>
      <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold text-[var(--color-text-primary)] mb-3">
        Latest News
      </h1>
      <p className="text-[var(--color-text-secondary)] mb-10 max-w-2xl">
        The latest happenings in the Harness Engineering ecosystem — funding, launches, and industry moves.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {news.map((item) => (
          <ContentCard
            key={item.slug}
            href={`/news/${item.slug}`}
            title={item.title}
            description={item.description}
            author={item.author}
            category={item.category}
          />
        ))}
      </div>
    </div>
  );
}
