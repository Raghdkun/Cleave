import { chromium, type Browser } from 'playwright';
import type { CrawlResult } from './types.js';
import { isSafeUrl } from './utils/url-validator.js';
import { logger } from './utils/logger.js';

interface CrawlerConfig {
  timeout: number;
  headless: boolean;
}

const DEFAULT_CONFIG: CrawlerConfig = {
  timeout: 30_000,
  headless: true,
};

export class Crawler {
  private readonly config: CrawlerConfig;
  private browser: Browser | null = null;

  constructor(config?: Partial<CrawlerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async launchBrowser(): Promise<void> {
    logger.info('Launching browser...');
    this.browser = await chromium.launch({ headless: this.config.headless });
    logger.info('Browser launched');
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }

  async crawlPage(url: string): Promise<CrawlResult> {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launchBrowser() first.');
    }

    const safe = await isSafeUrl(url);
    if (!safe) {
      throw new Error('Refused to crawl unsafe URL');
    }

    const page = await this.browser.newPage();

    // Capture every successful asset response (catches dynamic imports + lazy chunks
    // that aren't statically referenced in the HTML).
    const discoveredUrls = new Set<string>();
    const ASSET_RESOURCE_TYPES = new Set([
      'script',
      'stylesheet',
      'font',
      'image',
      'media',
      'fetch', // covers dynamic import() and runtime fetches for JSON/etc.
      'xhr',
    ]);
    page.on('response', (response) => {
      try {
        const status = response.status();
        if (status < 200 || status >= 400) return;
        const reqUrl = response.url();
        if (!/^https?:/i.test(reqUrl)) return;
        const type = response.request().resourceType();
        if (!ASSET_RESOURCE_TYPES.has(type)) return;
        discoveredUrls.add(reqUrl);
      } catch {
        // Ignore individual response errors; keep crawling
      }
    });

    try {
      logger.info(`Navigating to ${url}...`);
      try {
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: this.config.timeout,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Timeout') || message.includes('TimeoutError')) {
          logger.warn('networkidle timed out, falling back to domcontentloaded');
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeout,
          });
          await page.waitForTimeout(3000);
        } else {
          throw err;
        }
      }

      // Trigger lazy-loaded content: scroll through the full page so intersection
      // observers fire and route-based dynamic imports get pulled.
      await this.autoScroll(page);

      // Settle network for any final lazy chunks
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // Best-effort
      }

      logger.info('Page loaded, extracting HTML...');

      let baseUrl = page.url();

      const baseHref = await page.evaluate(() => {
        const base = document.querySelector('base[href]');
        return base ? base.getAttribute('href') : null;
      });

      if (baseHref) {
        baseUrl = new URL(baseHref, baseUrl).href;
      }

      const html = await page.content();

      logger.info(`Crawl complete. Base URL: ${baseUrl}`);
      logger.info(`Discovered ${discoveredUrls.size} network assets`);

      return { html, baseUrl, discoveredUrls: [...discoveredUrls] };
    } finally {
      await page.close();
    }
  }

  /** Scroll the page incrementally to trigger lazy-load observers. */
  private async autoScroll(page: import('playwright').Page): Promise<void> {
    try {
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let total = 0;
          const distance = 600;
          const interval = setInterval(() => {
            const scrollHeight = document.documentElement.scrollHeight;
            window.scrollBy(0, distance);
            total += distance;
            if (total >= scrollHeight + 800) {
              clearInterval(interval);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 120);
          // Hard cap to prevent infinite scroll on pages with infinite-load lists
          setTimeout(() => {
            clearInterval(interval);
            window.scrollTo(0, 0);
            resolve();
          }, 8000);
        });
      });
    } catch {
      // Non-fatal
    }
  }

  async crawl(url: string): Promise<CrawlResult> {
    await this.launchBrowser();
    try {
      return await this.crawlPage(url);
    } finally {
      await this.closeBrowser();
    }
  }
}

export default Crawler;
