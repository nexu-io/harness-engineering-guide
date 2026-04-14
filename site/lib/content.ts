import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

const contentDirectory = path.join(process.cwd(), "content");

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export interface ContentItem {
  slug: string;
  title: string;
  description: string;
  author: string;
  category: string;
  date: string;
  originalUrl: string;
  contentHtml: string;
  headings: HeadingItem[];
}

// Guide chapter order
export const guideOrder = [
  "introduction",
  "concepts",
  "patterns",
  "memory",
  "security",
];

export const guideChapters: Record<string, string> = {
  introduction: "Introduction",
  concepts: "Core Concepts",
  patterns: "Patterns & Architecture",
  memory: "Memory Systems",
  security: "Safety & Security",
};

export const zhGuideChapters: Record<string, string> = {
  introduction: "入门介绍",
  concepts: "核心概念",
  patterns: "模式与架构",
  memory: "记忆系统",
  security: "安全与防护",
};

function extractHeadings(markdown: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, "").replace(/`/g, "").trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      headings.push({ id, text, level });
    }
  }
  return headings;
}

function extractMetadataFromContent(markdown: string): {
  title: string;
  description: string;
  author: string;
  category: string;
  date: string;
  originalUrl: string;
} {
  const lines = markdown.split("\n");
  let title = "";
  let description = "";
  let author = "";
  let category = "";
  let date = "";
  let originalUrl = "";

  for (const line of lines) {
    if (!title && line.startsWith("# ")) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (line.includes("**Original**") || line.includes("**原文**")) {
      const urlMatch = line.match(/\[([^\]]*)\]\(([^)]+)\)/);
      if (urlMatch) {
        originalUrl = urlMatch[2];
      }
      // Extract author from after the URL
      const parts = line.split("·").map((s) => s.trim());
      if (parts.length >= 2) {
        author = parts[1].replace(/\*\*/g, "").trim();
      }
      if (parts.length >= 3) {
        date = parts[2].replace(/\*\*/g, "").trim();
      }
      continue;
    }
    if (line.includes("**Category**") || line.includes("**分类**")) {
      category = line
        .replace(/.*\*\*Category\*\*:\s*/, "")
        .replace(/.*\*\*分类\*\*:\s*/, "")
        .replace(/>/g, "")
        .trim();
      continue;
    }
  }

  // Extract first paragraph as description
  let inFirstParagraph = false;
  const descLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("# ")) {
      inFirstParagraph = false;
      continue;
    }
    if (line.startsWith(">")) continue;
    if (line.startsWith("---")) {
      inFirstParagraph = true;
      continue;
    }
    if (inFirstParagraph && line.trim()) {
      if (line.startsWith("#")) break;
      descLines.push(line.trim());
      if (descLines.length >= 2) break;
    }
    if (!inFirstParagraph && line.trim() && !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("---") && !line.startsWith("```") && !line.startsWith("|")) {
      descLines.push(line.trim());
      if (descLines.length >= 2) break;
    }
  }
  description = descLines.join(" ").slice(0, 200);

  return { title, description, author, category, date, originalUrl };
}

async function processMarkdown(content: string): Promise<string> {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(content);

  let html = result.toString();

  // Add IDs to headings for ToC linking
  html = html.replace(/<h([2-3])>(.*?)<\/h[2-3]>/g, (_, level, text) => {
    const plainText = text.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, "");
    const id = plainText
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
    return `<h${level} id="${id}">${text}</h${level}>`;
  });

  // Make external links open in new tab
  html = html.replace(
    /<a href="(https?:\/\/[^"]+)">/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">'
  );

  return html;
}

export async function getContentBySlug(
  directory: string,
  slug: string
): Promise<ContentItem> {
  const fullPath = path.join(contentDirectory, directory, `${slug}.md`);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  const headings = extractHeadings(content);
  const extracted = extractMetadataFromContent(content);
  const contentHtml = await processMarkdown(content);

  return {
    slug,
    title: data.title || extracted.title || slug,
    description: data.description || extracted.description || "",
    author: data.author || extracted.author || "",
    category: data.category || extracted.category || "",
    date: data.date || extracted.date || "",
    originalUrl: data.originalUrl || extracted.originalUrl || "",
    contentHtml,
    headings,
  };
}

export function getSlugs(directory: string): string[] {
  const dir = path.join(contentDirectory, directory);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""));
}

export async function getAllContent(
  directory: string
): Promise<ContentItem[]> {
  const slugs = getSlugs(directory);
  const items = await Promise.all(
    slugs.map((slug) => getContentBySlug(directory, slug))
  );
  return items;
}
