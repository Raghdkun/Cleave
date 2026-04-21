import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { Crawler } from './crawler.js';
import type { PageResult, SiteCrawlConfig } from './types.js';
import { slugifyPath } from './utils/slugify.js';
import { logger } from './utils/logger.js';

const NON_PAGE_EXTENSIONS = new Set([
  '.pdf', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.svg',
  '.css', '.js', '.mp4', '.mp3', '.webm', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
]);

const SKIP_SCHEMES = ['javascript:', 'mailto:', 'tel:', 'data:', 'blob:'];

export class SiteCrawler {
  private readonly config: SiteCrawlConfig;
  private readonly crawler: Crawler;
  private readonly visited: Set<string> = new Set();
  private readonly pageMap: Map<string, string> = new Map();
  private rootOrigin = '';

  constructor(config: SiteCrawlConfig) {
    this.config = config;
    this.crawler = new Crawler();
  }

  async crawlSite(startUrl: string): Promise<{ pages: PageResult[]; pageMap: Map<string, string> }> {
    const parsedStart = new URL(startUrl);
    this.rootOrigin = parsedStart.origin;

    const normalizedStart = this.normalizeUrl(startUrl);
    this.visited.add(normalizedStart);

    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
    const pages: PageResult[] = [];
    const limit = pLimit(this.config.concurrencyLimit);

    await this.crawler.launchBrowser();
    try {
      while (queue.length > 0) {
        // Enforce maxPages limit
        if (this.config.maxPages > 0 && pages.length >= this.config.maxPages) {
          logger.info(`Reached maxPages limit (${this.config.maxPages}), stopping crawl`);
          break;
        }

        const batch = queue.splice(0);

        // Trim batch to not exceed maxPages
        const remaining = this.config.maxPages > 0
          ? this.config.maxPages - pages.length
          : batch.length;
        const trimmedBatch = batch.slice(0, remaining);

        const batchResults = await Promise.all(
          trimmedBatch.map(({ url, depth }) =>
            limit(() => this.processPage(url, depth))
          )
        );

        for (const result of batchResults) {
          if (!result) continue;
          pages.push(result.page);

          if (result.depth < this.config.maxDepth) {
            for (const link of result.discoveredLinks) {
              const normalized = this.normalizeUrl(link);
              if (!this.visited.has(normalized)) {
                this.visited.add(normalized);
                queue.push({ url: link, depth: result.depth + 1 });
              }
            }
          }
        }

        if (this.config.onProgress) {
          this.config.onProgress({
            discovered: this.visited.size,
            processed: pages.length,
            assetsRemaining: 0,
          });
        }
      }
    } finally {
      await this.crawler.closeBrowser();
    }

    return { pages, pageMap: this.pageMap };
  }

  getPageMap(): Map<string, string> {
    return new Map(this.pageMap);
  }

  private async processPage(
    url: string,
    depth: number,
  ): Promise<{ page: PageResult; depth: number; discoveredLinks: string[] } | null> {
    logger.info(`Crawling [depth=${depth}]: ${url}`);

    try {
      const { html, baseUrl, discoveredUrls } = await this.crawler.crawlPage(url);
      const localPath = slugifyPath(new URL(url).pathname);

      const normalized = this.normalizeUrl(url);
      this.pageMap.set(normalized, localPath);

      // Also store the trailing-slash variant
      const withSlash = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized + '/';
      if (!this.pageMap.has(withSlash)) {
        this.pageMap.set(withSlash, localPath);
      }

      const discoveredLinks = this.extractLinks(html, baseUrl);

      return {
        page: { url, html, baseUrl, localPath, discoveredUrls },
        depth,
        discoveredLinks,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to crawl ${url}: ${message}`);
      return null;
    }
  }

  private extractLinks(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const links = new Set<string>();

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.trim() === '') return;

      if (SKIP_SCHEMES.some((scheme) => href.trimStart().startsWith(scheme))) return;

      let resolved: URL;
      try {
        resolved = new URL(href, baseUrl);
      } catch {
        return;
      }

      // Strip fragment
      resolved.hash = '';

      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;

      if (this.config.sameDomainOnly && resolved.origin !== this.rootOrigin) return;

      // Skip non-page extensions
      const lastSegment = resolved.pathname.split('/').pop() ?? '';
      const dotIndex = lastSegment.lastIndexOf('.');
      if (dotIndex !== -1) {
        const ext = lastSegment.slice(dotIndex).toLowerCase();
        if (NON_PAGE_EXTENSIONS.has(ext)) return;
      }

      links.add(resolved.href);
    });

    return [...links];
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.search = '';
      let normalized = parsed.href;
      if (normalized.endsWith('/') && parsed.pathname !== '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }
}
