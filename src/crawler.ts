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

      return { html, baseUrl };
    } finally {
      await page.close();
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
