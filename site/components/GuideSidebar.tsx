"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { guideSections } from "@/lib/guide-data";

export default function GuideSidebar({ isZh = false }: { isZh?: boolean }) {
  const pathname = usePathname();
  const prefix = isZh ? "/zh" : "";

  return (
    <aside className="w-64 shrink-0 hidden lg:block">
      <nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-4 pb-8">
        {guideSections.map((section) => (
          <div key={section.id} className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2 px-2">
              {isZh ? section.zhLabel : section.label}
            </h3>
            <ul className="space-y-0.5">
              {section.items.length === 0 ? (
                <li className="px-2 py-1.5 text-xs text-[var(--color-text-muted)] italic">
                  {isZh ? "即将推出…" : "Coming soon…"}
                </li>
              ) : (
                section.items.map((item) => {
                  const href = `${prefix}/guide/${item.slug}`;
                  const isActive = pathname === href || pathname === `${href}/`;
                  return (
                    <li key={item.slug}>
                      <Link
                        href={href}
                        className={`block px-2 py-1.5 text-sm rounded-md transition-colors ${
                          isActive
                            ? "text-[var(--color-accent-cyan)] bg-[var(--color-accent-cyan)]/10 font-medium"
                            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]"
                        }`}
                      >
                        {isZh ? item.zhTitle : item.title}
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
