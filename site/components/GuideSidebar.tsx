"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Chapter {
  slug: string;
  title: string;
  index: number;
}

export default function GuideSidebar({
  chapters,
  basePath,
}: {
  chapters: Chapter[];
  basePath: string;
}) {
  const pathname = usePathname();

  return (
    <nav>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4 font-[family-name:var(--font-heading)]">
        Chapters
      </p>
      <ul className="space-y-1">
        {chapters.map((ch) => {
          const href = `${basePath}/${ch.slug}`;
          const active = pathname === href || pathname === `${href}/`;
          return (
            <li key={ch.slug}>
              <Link
                href={href}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  active
                    ? "text-[var(--color-accent-cyan)] bg-[var(--color-accent-cyan-dim)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]"
                }`}
              >
                <span
                  className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded ${
                    active
                      ? "bg-[var(--color-accent-cyan)] text-white"
                      : "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]"
                  }`}
                >
                  {ch.index + 1}
                </span>
                {ch.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
