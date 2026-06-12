import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const articleDirectory = join(process.cwd(), "content/articles");
const allowedStatuses = ["draft", "scheduled", "published"] as const;
export const pillarArticleSlugs = new Set([
  "meet-pip-cute-money-companion",
  "why-your-bank-balance-is-misleading",
  "what-is-spendable-cash-today",
]);
const supportedCustomBlockTypes = new Set([
  "callout",
  "pip-says",
  "money-example",
  "comparison",
  "cta",
  "quote",
  "figure",
]);

const faqSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

const frontmatterSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  publishedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  author: z.string().trim().min(1),
  status: z.enum(allowedStatuses),
  featured: z.boolean().optional().default(false),
  tags: z.array(z.string().trim().min(1)).min(1),
  seo: z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
  }),
  faq: z.array(faqSchema).optional(),
  canonicalUrl: z.string().trim().url().optional(),
  ogImage: z.string().trim().min(1).optional(),
  related: z.array(z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).optional(),
});

export type ArticleStatus = (typeof allowedStatuses)[number];
export type ArticleFrontmatter = z.infer<typeof frontmatterSchema>;
export type ArticleHeading = {
  id: string;
  level: 2 | 3;
  text: string;
};
export type ArticleKeyValueRow = {
  label: string;
  value: string;
};
export type ArticleBodyBlock =
  | { type: "heading"; heading: ArticleHeading }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; title?: string; body: string }
  | { type: "pip-says"; body: string }
  | { type: "money-example"; title?: string; rows: ArticleKeyValueRow[] }
  | { type: "comparison"; title?: string; items: ArticleKeyValueRow[] }
  | { type: "inline-cta"; body: string; href: string; label: string }
  | { type: "pull-quote"; body: string }
  | { type: "figure"; src: string; alt: string; caption?: string; width?: number; height?: number };

export type Article = ArticleFrontmatter & {
  blocks: ArticleBodyBlock[];
  body: string;
  bodyWordCount: number;
  hasInlineCta: boolean;
  headings: ArticleHeading[];
  readingTimeMinutes: number;
};

export function getPublishedArticles(): Article[] {
  return getAllArticles().filter((article) => article.status === "published");
}

export function getAllArticles(): Article[] {
  if (!existsSync(articleDirectory)) {
    return [];
  }

  const articles = readdirSync(articleDirectory)
    .filter((fileName) => /\.mdx?$/.test(fileName))
    .map((fileName) => readArticleFile(join(articleDirectory, fileName)))
    .sort((first, second) => {
      if (first.publishedAt === second.publishedAt) {
        return first.title.localeCompare(second.title);
      }

      return second.publishedAt.localeCompare(first.publishedAt);
    });

  assertUniqueSlugs(articles);

  return articles;
}

export function getArticleBySlug(slug: string): Article | null {
  return getPublishedArticles().find((article) => article.slug === slug) ?? null;
}

export function getFeaturedArticle(): Article | null {
  return getPublishedArticles().find((article) => article.featured) ?? getPublishedArticles()[0] ?? null;
}

export function getRelatedArticles(article: Article, limit = 3): Article[] {
  const published = getPublishedArticles().filter((candidate) => candidate.slug !== article.slug);
  const explicit = (article.related ?? [])
    .map((slug) => published.find((candidate) => candidate.slug === slug))
    .filter((candidate): candidate is Article => Boolean(candidate));
  const explicitSlugs = new Set(explicit.map((candidate) => candidate.slug));
  const sharedTags = published
    .filter((candidate) => !explicitSlugs.has(candidate.slug))
    .map((candidate) => ({
      article: candidate,
      score: candidate.tags.filter((tag) => article.tags.includes(tag)).length,
    }))
    .sort((first, second) => second.score - first.score || first.article.title.localeCompare(second.article.title))
    .map((candidate) => candidate.article);

  return [...explicit, ...sharedTags].slice(0, limit);
}

export function calculateReadingTimeMinutes(body: string): number {
  return Math.max(1, Math.ceil(calculateBodyWordCount(body) / 220));
}

export function calculateBodyWordCount(body: string): number {
  const words = body
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return words;
}

export function parseArticleSource(source: string): { frontmatter: ArticleFrontmatter; body: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    throw new Error("Article is missing frontmatter delimiters.");
  }

  const rawFrontmatter = parseFrontmatterBlock(match[1]);
  const parsed = frontmatterSchema.safeParse(rawFrontmatter);

  if (!parsed.success) {
    throw new Error(`Invalid article frontmatter: ${parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}`);
  }

  return {
    frontmatter: parsed.data,
    body: match[2].trim(),
  };
}

function readArticleFile(path: string): Article {
  const source = readFileSync(path, "utf8");
  const parsed = parseArticleSource(source);
  const blocks = parseArticleBody(parsed.body);
  const headings = extractArticleHeadings(blocks);

  return {
    ...parsed.frontmatter,
    blocks,
    body: parsed.body,
    bodyWordCount: calculateBodyWordCount(parsed.body),
    hasInlineCta: blocks.some((block) => block.type === "inline-cta"),
    headings,
    readingTimeMinutes: calculateReadingTimeMinutes(parsed.body),
  };
}

export function parseArticleBody(body: string): ArticleBodyBlock[] {
  assertNoUnsupportedHtml(body);

  const blocks: ArticleBodyBlock[] = [];
  const paragraphLines: string[] = [];
  const lines = body.split(/\r?\n/);
  let index = 0;

  function flushParagraph() {
    const normalizedLines = paragraphLines.map((line) => line.trim()).filter(Boolean);
    paragraphLines.length = 0;

    if (normalizedLines.length === 0) {
      return;
    }

    if (normalizedLines.every((line) => line.startsWith("- "))) {
      blocks.push({
        type: "list",
        items: normalizedLines.map((line) => line.slice(2).trim()).filter(Boolean),
      });
      return;
    }

    blocks.push({
      type: "paragraph",
      text: normalizedLines.join(" "),
    });
  }

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (trimmed.startsWith(":::")) {
      flushParagraph();
      const parsed = parseCustomBlock(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph();
      const text = trimmed.slice(3).trim();
      blocks.push({
        type: "heading",
        heading: {
          id: slugify(text),
          level: 2,
          text,
        },
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph();
      const text = trimmed.slice(4).trim();
      blocks.push({
        type: "heading",
        heading: {
          id: slugify(text),
          level: 3,
          text,
        },
      });
      index += 1;
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

export function extractArticleHeadings(blocks: ArticleBodyBlock[]): ArticleHeading[] {
  return blocks.flatMap((block) => (block.type === "heading" ? [block.heading] : []));
}

export function getArticleQualityIssues(article: Article): string[] {
  if (article.status !== "published") {
    return [];
  }

  const issues: string[] = [];
  const minimumWordCount = pillarArticleSlugs.has(article.slug) ? 900 : 700;

  if (article.bodyWordCount < minimumWordCount) {
    issues.push(`Expected at least ${minimumWordCount} body words, received ${article.bodyWordCount}.`);
  }

  if (article.readingTimeMinutes < 3) {
    issues.push("Expected reading time to be at least 3 minutes.");
  }

  if ((article.faq?.length ?? 0) < 2) {
    issues.push("Expected at least 2 FAQ entries.");
  }

  if ((article.related?.length ?? 0) < 1) {
    issues.push("Expected at least 1 related article.");
  }

  if (!article.hasInlineCta) {
    issues.push("Expected an inline CTA block.");
  }

  const h2Headings = article.headings.filter((heading) => heading.level === 2).map((heading) => heading.text);

  if (!h2Headings.some((heading) => heading.toLowerCase() !== "quick answer")) {
    issues.push("Expected at least one H2 after Quick answer.");
  }

  return issues;
}

function assertUniqueSlugs(articles: Article[]) {
  const seen = new Set<string>();
  const duplicates = articles
    .map((article) => article.slug)
    .filter((slug) => {
      if (seen.has(slug)) {
        return true;
      }

      seen.add(slug);
      return false;
    });

  if (duplicates.length > 0) {
    throw new Error(`Duplicate article slugs: ${duplicates.join(", ")}`);
  }
}

function parseFrontmatterBlock(block: string): Record<string, unknown> {
  const lines = block.split(/\r?\n/);
  const result: Record<string, unknown> = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const match = line.match(/^([A-Za-z][\w.]*):(?:\s*(.*))?$/);

    if (!match) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }

    const [, key, value] = match;

    if (value) {
      setFrontmatterValue(result, key, parseScalar(value));
      index += 1;
      continue;
    }

    const next = lines[index + 1];

    if (next?.startsWith("  - ")) {
      const { value: arrayValue, nextIndex } = parseArray(lines, index + 1);
      setFrontmatterValue(result, key, arrayValue);
      index = nextIndex;
      continue;
    }

    const { value: objectValue, nextIndex } = parseObject(lines, index + 1);
    setFrontmatterValue(result, key, objectValue);
    index = nextIndex;
  }

  return result;
}

function parseArray(lines: string[], startIndex: number): { value: unknown[]; nextIndex: number } {
  const value: unknown[] = [];
  let index = startIndex;

  while (index < lines.length && lines[index].startsWith("  - ")) {
    const itemText = lines[index].slice(4);
    const objectMatch = itemText.match(/^([A-Za-z][\w.]*):\s*(.*)$/);

    if (!objectMatch) {
      value.push(parseScalar(itemText));
      index += 1;
      continue;
    }

    const item: Record<string, unknown> = {
      [objectMatch[1]]: parseScalar(objectMatch[2]),
    };
    index += 1;

    while (index < lines.length && lines[index].startsWith("    ")) {
      const nested = lines[index].slice(4).match(/^([A-Za-z][\w.]*):\s*(.*)$/);

      if (!nested) {
        throw new Error(`Unsupported array object line: ${lines[index]}`);
      }

      item[nested[1]] = parseScalar(nested[2]);
      index += 1;
    }

    value.push(item);
  }

  return { value, nextIndex: index };
}

function parseObject(lines: string[], startIndex: number): { value: Record<string, unknown>; nextIndex: number } {
  const value: Record<string, unknown> = {};
  let index = startIndex;

  while (index < lines.length && lines[index].startsWith("  ") && !lines[index].startsWith("  - ")) {
    const match = lines[index].slice(2).match(/^([A-Za-z][\w.]*):\s*(.*)$/);

    if (!match) {
      throw new Error(`Unsupported object frontmatter line: ${lines[index]}`);
    }

    value[match[1]] = parseScalar(match[2]);
    index += 1;
  }

  return { value, nextIndex: index };
}

function parseScalar(value: string): string | boolean {
  const trimmed = value.trim();

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  const quoted = trimmed.match(/^"(.*)"$/) ?? trimmed.match(/^'(.*)'$/);

  return quoted ? quoted[1] : trimmed;
}

function setFrontmatterValue(target: Record<string, unknown>, key: string, value: unknown) {
  const path = key.split(".");
  let cursor = target;

  for (const part of path.slice(0, -1)) {
    const next = cursor[part];

    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[part] = {};
    }

    cursor = cursor[part] as Record<string, unknown>;
  }

  cursor[path[path.length - 1]] = value;
}

function parseCustomBlock(lines: string[], startIndex: number): { block: ArticleBodyBlock; nextIndex: number } {
  const opener = lines[startIndex].trim();
  const openerMatch = opener.match(/^:::([a-z][a-z-]*)(?:\s+(.*))?$/);

  if (!openerMatch) {
    throw new Error(`Malformed custom article block opener: ${opener}`);
  }

  const [, rawType, rawAttributes = ""] = openerMatch;

  if (!supportedCustomBlockTypes.has(rawType)) {
    throw new Error(`Unsupported custom article block type: ${rawType}`);
  }

  const contentLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && lines[index].trim() !== ":::") {
    contentLines.push(lines[index]);
    index += 1;
  }

  if (index >= lines.length) {
    throw new Error(`Custom article block is missing a closing marker: ${rawType}`);
  }

  const attributes = parseCustomBlockAttributes(rawAttributes);
  const body = contentLines.join("\n").trim();
  const nextIndex = index + 1;

  switch (rawType) {
    case "callout":
      return { block: { type: "callout", title: attributes.title, body: requireBlockBody(rawType, body) }, nextIndex };
    case "pip-says":
      return { block: { type: "pip-says", body: requireBlockBody(rawType, body) }, nextIndex };
    case "money-example":
      return {
        block: {
          type: "money-example",
          title: attributes.title,
          rows: parseKeyValueRows(rawType, body),
        },
        nextIndex,
      };
    case "comparison":
      return {
        block: {
          type: "comparison",
          title: attributes.title,
          items: parseKeyValueRows(rawType, body),
        },
        nextIndex,
      };
    case "cta":
      return {
        block: {
          type: "inline-cta",
          body: requireBlockBody(rawType, body),
          href: attributes.href ?? "#join-beta",
          label: attributes.label ?? "Join the beta",
        },
        nextIndex,
      };
    case "quote":
      return { block: { type: "pull-quote", body: requireBlockBody(rawType, body) }, nextIndex };
    case "figure":
      return {
        block: {
          type: "figure",
          src: requireAttribute(rawType, attributes, "src"),
          alt: requireAttribute(rawType, attributes, "alt"),
          caption: body || undefined,
          width: parseOptionalPositiveIntegerAttribute(rawType, attributes.width, "width"),
          height: parseOptionalPositiveIntegerAttribute(rawType, attributes.height, "height"),
        },
        nextIndex,
      };
    default:
      throw new Error(`Unsupported custom article block type: ${rawType}`);
  }
}

function parseCustomBlockAttributes(rawAttributes: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let remaining = rawAttributes.trim();
  const attributePattern = /^([a-z][\w-]*)="([^"]*)"\s*/;

  while (remaining) {
    const match = remaining.match(attributePattern);

    if (!match) {
      throw new Error(`Unsupported custom article block attributes: ${rawAttributes}`);
    }

    attributes[match[1]] = match[2];
    remaining = remaining.slice(match[0].length).trimStart();
  }

  return attributes;
}

function parseKeyValueRows(blockType: string, body: string): ArticleKeyValueRow[] {
  const rows = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]+):\s*(.+)$/);

      if (!match) {
        throw new Error(`Expected "${blockType}" rows to use "Label: value" format.`);
      }

      return {
        label: match[1].trim(),
        value: match[2].trim(),
      };
    });

  if (rows.length === 0) {
    throw new Error(`Expected "${blockType}" block to contain at least one row.`);
  }

  return rows;
}

function requireBlockBody(blockType: string, body: string): string {
  if (!body) {
    throw new Error(`Expected "${blockType}" block to contain body text.`);
  }

  return body;
}

function requireAttribute(blockType: string, attributes: Record<string, string>, attributeName: string): string {
  const value = attributes[attributeName]?.trim();

  if (!value) {
    throw new Error(`Expected "${blockType}" block to include ${attributeName} attribute.`);
  }

  return value;
}

function parseOptionalPositiveIntegerAttribute(
  blockType: string,
  value: string | undefined,
  attributeName: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected "${blockType}" ${attributeName} attribute to be a positive integer.`);
  }

  return parsed;
}

function assertNoUnsupportedHtml(body: string) {
  if (/<\/?[a-z][\s\S]*>/i.test(body)) {
    throw new Error("Article bodies do not support raw HTML.");
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
