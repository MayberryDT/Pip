import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const articleDirectory = join(process.cwd(), "content/articles");
const allowedStatuses = ["draft", "scheduled", "published"] as const;

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

export type Article = ArticleFrontmatter & {
  body: string;
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
  const words = body
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 220));
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

  return {
    ...parsed.frontmatter,
    body: parsed.body,
    readingTimeMinutes: calculateReadingTimeMinutes(parsed.body),
  };
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
