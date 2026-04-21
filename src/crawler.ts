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

      // Sanitize transient mid-page-load DOM mutations before serializing.
      //
      // Many sites (Webflow especially) run a DOMContentLoaded handler that
      // sets `body.style.overflow = "hidden"` to lock scroll while a preloader
      // animation plays, then clears it when the preloader finishes. If the
      // crawler captures the DOM while the preloader is still mid-animation
      // (Webflow IX2 leaves it at `style="display: flex; opacity: 0;"`), the
      // exported page boots with body locked AND a preloader element that
      // never reaches `display: none`, so the lock is never released and the
      // page is permanently un-scrollable / un-clickable.
      //
      // Strip the inline overflow on <html>/<body> so the static export starts
      // with normal scroll. The page's own load script will re-apply it on the
      // user's browser if needed; or the preloader will simply not block.
      await page.evaluate(() => {
        for (const el of [document.documentElement, document.body]) {
          if (!el) continue;
          if (/overflow\s*:/.test(el.getAttribute('style') ?? '')) {
            el.style.removeProperty('overflow');
            el.style.removeProperty('overflow-x');
            el.style.removeProperty('overflow-y');
            if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
          }
        }
        // Reset preloader-style elements that animation systems left in a
        // mid-animation state. We only target elements whose CLASS hints at
        // "preloader" / "loader" / "loading" intent so we don't disturb
        // legitimate page state.
        const sel = '[class*="preloader"], [class*="page-loader"], [id*="preloader"]';
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          // If JS animation parked it at opacity:0 / display:none / visibility:hidden,
          // it has effectively finished. Remove it from the DOM so the page-author's
          // own load script (which often does `if (!preloader) return;` then locks
          // body.overflow waiting for a *future* preloader mutation) bails out
          // instead of locking the page forever.
          const cs = getComputedStyle(el);
          const finished =
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            parseFloat(cs.opacity) <= 0.01;
          if (finished) {
            el.remove();
          }
        }

        // ---------------------------------------------------------------
        // Strip JS-injected animation state from inline `style` attributes.
        //
        // GSAP, Webflow IX2, ScrollTrigger, Swiper, etc. inject inline
        // `transform`, `opacity`, `will-change`, `transition-duration`
        // continuously while the page runs. When we serialize the DOM
        // mid-flight, these inline values persist into the static export
        // and FREEZE the elements at whatever position they were in when
        // we snapshotted (e.g. a 3D box rail stuck at translate3d(-130%),
        // a swiper-wrapper offset to slide 3, a card with opacity:0 from
        // a fade-in that never re-runs because IX2 thinks it already has).
        //
        // On reload the animation libs reinitialize but the conflicting
        // inline values either fight with the lib or short-circuit it.
        // Strip them so animations start from a clean slate.
        // ---------------------------------------------------------------
        const ANIM_TRANSFORM_RE =
          /translate3d|scale3d|matrix3d|matrix\(|rotate3d|rotateX|rotateY|rotateZ|skew\(|skewX|skewY|0vw|0vh/i;
        const SWIPER_SEL =
          '.swiper, .swiper-wrapper, .swiper-slide, [class*="swiper-"]';
        const allEls = document.querySelectorAll<HTMLElement>('[style]');
        for (const el of allEls) {
          const style = el.getAttribute('style');
          if (!style) continue;

          // will-change is purely an optimization hint; stripping it never
          // breaks layout but removes leftover hints from finished animations.
          el.style.removeProperty('will-change');

          // transform-style: preserve-3d is set by 3D animation libs and is
          // safe to strip (it will be re-applied if needed).
          if (/transform-style\s*:\s*preserve-3d/i.test(style)) {
            el.style.removeProperty('transform-style');
          }

          // Inline transform with JS-animation signature (translate3d, matrix3d,
          // viewport units like 0vw, etc.) is JS-injected animation state.
          const inlineTransform = el.style.transform;
          if (inlineTransform && ANIM_TRANSFORM_RE.test(inlineTransform)) {
            el.style.removeProperty('transform');
          }

          // Webflow IX2 marks animated elements with `data-w-id`. Anything
          // inline on those (transform/opacity/transition) is animation state.
          if (el.hasAttribute('data-w-id')) {
            el.style.removeProperty('transform');
            el.style.removeProperty('opacity');
            el.style.removeProperty('transition');
            el.style.removeProperty('transition-duration');
            el.style.removeProperty('transition-property');
          }

          // Cleanup empty style attribute
          if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
        }

        // Swiper-specific cleanup: Swiper writes inline transform/transition
        // on .swiper-wrapper (slide offset) and .swiper-slide (per-slide
        // transition-duration). It also adds runtime classes like
        // swiper-initialized / swiper-slide-active that conflict with re-init.
        for (const el of document.querySelectorAll<HTMLElement>(SWIPER_SEL)) {
          el.style.removeProperty('transform');
          el.style.removeProperty('transition');
          el.style.removeProperty('transition-duration');
          el.style.removeProperty('transition-delay');
          if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
          // Strip Swiper runtime state classes so re-init starts clean.
          const runtimeClasses = [
            'swiper-initialized',
            'swiper-slide-active',
            'swiper-slide-prev',
            'swiper-slide-next',
            'swiper-slide-duplicate-active',
            'swiper-slide-duplicate-prev',
            'swiper-slide-duplicate-next',
            'swiper-slide-visible',
            'swiper-horizontal',
            'swiper-vertical',
            'swiper-watch-progress',
            'swiper-backface-hidden',
          ];
          for (const c of runtimeClasses) el.classList.remove(c);
        }

        // Some sites set scroll-progress driven CSS variables / inline width
        // on progress bars (e.g. .border-grad-animation width:93.6%).
        // These get baked in. We can't always tell which are animation-only,
        // but if a class name suggests progress/scroll-driven, reset width.
        const progressSel =
          '[class*="border-grad-animation"], [class*="progress-bar"], [class*="scroll-progress"]';
        for (const el of document.querySelectorAll<HTMLElement>(progressSel)) {
          if (/width\s*:/i.test(el.getAttribute('style') ?? '')) {
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
          }
        }

        // Reset scroll position to top so any snapshot of scroll-dependent
        // state (sticky/fixed offsets, pinned ScrollTrigger states) reflects
        // the initial view, not the bottom of the page.
        window.scrollTo(0, 0);
      });

      // Give animation libs one tick to settle into their initial state
      // after we wiped the inline animation values.
      await page.waitForTimeout(300);

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
