"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

const enNavLinks = [
  { href: "/guide/what-is-harness", label: "Guide" },
  { href: "/changelog", label: "Changelog" },
];

const zhNavLinks = [
  { href: "/zh/guide/what-is-harness", label: "指南" },
  { href: "/zh/changelog", label: "日报" },
];

function LangSwitcher({ isZh }: { isZh: boolean }) {
  const pathname = usePathname();
  const targetPath = isZh
    ? pathname.replace(/^\/zh/, "") || "/"
    : `/zh${pathname === "/" ? "" : pathname}`;
  const currentLabel = isZh ? "中文" : "EN";
  const targetLabel = isZh ? "EN" : "中文";

  return (
    <div className="relative group">
      <button className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
        🌐 {currentLabel}
        <svg
          className="w-3 h-3 opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div className="absolute right-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <Link
          href={targetPath}
          className="block px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md whitespace-nowrap"
        >
          {targetLabel}
        </Link>
      </div>
    </div>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const isZh = pathname.startsWith("/zh");
  const navLinks = isZh ? zhNavLinks : enNavLinks;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-bg-primary)]/80 backdrop-blur-md border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link
            href={isZh ? "/zh" : "/"}
            className="flex items-center gap-2 font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text-primary)] hover:text-[var(--color-accent-cyan)] transition-colors"
          >
            <Image src="/logo.svg" alt="Harness Guide" width={28} height={28} className="inline-block" />
            <span>{isZh ? "Harness Engineering Guide" : "Harness Guide"}</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-6">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm transition-colors ${
                    isActive
                      ? "text-[var(--color-accent-cyan)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <a
              href="https://github.com/nexu-io/harness-engineering-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              GitHub
            </a>
            <LangSwitcher isZh={isZh} />
            <ThemeToggle />
          </div>

          {/* Mobile menu button */}
          <button
            className="sm:hidden text-[var(--color-text-muted)]"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          <div className="px-4 py-3 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/nexu-io/harness-engineering-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              GitHub
            </a>
            <div className="flex items-center gap-3 pt-2">
              <LangSwitcher isZh={isZh} />
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
