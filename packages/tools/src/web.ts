/**
 * Web tools — scrape, search, parse, and crawl via firecrawl CLI.
 * Requires: npm install -g firecrawl-cli
 * Optional: FIRECRAWL_API_KEY for authenticated endpoints (crawl requires it).
 * Optional: FIRECRAWL_API_URL for self-hosted instance.
 */

import { runProcess } from "./bash.ts"

// scrape/search/parse support keyless free-tier; crawl requires an API key.
const hasApiKey = !!process.env.FIRECRAWL_API_KEY

export interface WebScrapeInput {
  urls: string[]
  onlyMainContent?: boolean
}

export interface WebSearchInput {
  query: string
  limit?: number
}

export interface WebParseInput {
  path: string
}

export interface WebCrawlInput {
  url: string
  limit?: number
  depth?: number
}

export async function webScrape(input: WebScrapeInput): Promise<string> {
  const contentArgs = input.onlyMainContent !== false ? ["--only-main-content"] : []
  const result = await runFirecrawl(["scrape", ...contentArgs, ...input.urls])
  return result.stdout || result.stderr || "(no content)"
}

export async function webSearch(input: WebSearchInput): Promise<string> {
  const limit = input.limit ?? 5
  const result = await runFirecrawl(["search", input.query, "--limit", String(limit)])
  return result.stdout || result.stderr || "(no results)"
}

export async function webParse(input: WebParseInput): Promise<string> {
  const result = await runFirecrawl(["parse", input.path])
  return result.stdout || result.stderr || "(no content)"
}

export async function webCrawl(input: WebCrawlInput): Promise<string> {
  if (hasApiKey) {
    // Authenticated path: native firecrawl crawl (full depth traversal)
    const limitArgs = input.limit ? ["--limit", String(input.limit)] : []
    const depthArgs = input.depth ? ["--max-depth", String(input.depth)] : []
    const result = await runFirecrawl(["crawl", ...limitArgs, ...depthArgs, input.url], 120000)
    return result.stdout || result.stderr || "(no content)"
  }

  // Keyless fallback: scrape root + extract links + scrape those (BFS depth-1)
  const maxPages = Math.min(input.limit ?? 5, 10)
  const pages: string[] = []

  // Scrape root
  const rootResult = await runFirecrawl(["scrape", input.url])
  const rootContent = rootResult.stdout || ""
  if (!rootContent) return "(no content)"
  pages.push(`## ${input.url}\n\n${rootContent}`)

  if (maxPages <= 1 || (input.depth ?? 1) < 1) {
    return pages.join("\n\n---\n\n")
  }

  // Extract same-origin links from markdown: [text](url)
  const origin = new URL(input.url).origin
  const linkRe = /\[.*?\]\((https?:\/\/[^\s)]+)\)/g
  const seen = new Set([input.url])
  const queue: string[] = []
  while (true) {
    const match = linkRe.exec(rootContent)
    if (!match) break
    const href = match[1]
    if (!href) continue
    if (href.startsWith(origin) && !seen.has(href)) {
      seen.add(href)
      queue.push(href)
    }
    if (queue.length >= maxPages - 1) break
  }

  // Scrape discovered links concurrently (batch of 3)
  for (let i = 0; i < queue.length; i += 3) {
    const batch = queue.slice(i, i + 3)
    const results = await Promise.all(
      batch.map((url) => runFirecrawl(["scrape", "--only-main-content", url]))
    )
    for (let j = 0; j < batch.length; j++) {
      const content = results[j].stdout
      if (content) pages.push(`## ${batch[j]}\n\n${content}`)
    }
    if (pages.length >= maxPages) break
  }

  return pages.join("\n\n---\n\n")
}

function runFirecrawl(args: string[], timeout?: number) {
  return runProcess({
    command: [Bun.which("firecrawl") ?? "firecrawl", ...args],
    ...(timeout !== undefined ? { timeout } : {}),
  })
}
