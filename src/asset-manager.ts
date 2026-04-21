import * as cheerio from 'cheerio';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import got from 'got';
import pLimit from 'p-limit';
import { parseSrcset, stringifySrcset } from 'srcset';
import { extname, posix } from 'node:path';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';
import type { AssetRecord, ProcessedPage } from './types.js';
import { resolveUrl } from './utils/url-resolver.js';
import { isSafeUrl } from './utils/url-validator.js';
import { logger } from './utils/logger.js';
import { getRelativePath } from './utils/slugify.js';

interface AssetManagerConfig {
  concurrency?: number;
  maxFileSize?: number;
  timeout?: number;
}

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_TIMEOUT = 30_000;

const EXT_TO_CATEGORY: Record<string, string> = {
  '.css': 'css',
  '.js': 'js',
  '.mjs': 'js',
  '.png': 'images',
  '.jpg': 'images',
  '.jpeg': 'images',
  '.gif': 'images',
  '.svg': 'images',
  '.webp': 'images',
  '.ico': 'images',
  '.avif': 'images',
  '.woff': 'fonts',
  '.woff2': 'fonts',
  '.ttf': 'fonts',
  '.otf': 'fonts',
  '.eot': 'fonts',
  '.mp4': 'media',
  '.webm': 'media',
  '.mp3': 'media',
  '.ogg': 'media',
  '.wav': 'media',
};

const SKIP_SCHEMES = ['data:', 'blob:', 'javascript:'];

// Hosts whose URLs frequently appear inside HTML/JS but are NOT static assets
// we can fetch (player APIs, telemetry beacons, dev examples, source maps).
// Anything matching here is filtered out before we even try to download.
const NOISE_HOST_BLOCKLIST = new Set([
  'github.com',
  'github.githubassets.com',
  'app.framerstatic.com',
  // YouTube IFrame Player internals — these paths (base.js, load.js,
  // main_light_binary.js, youtubei/*) are NOT public assets; the embed
  // resolves them dynamically against versioned subpaths. Trying to GET
  // https://www.youtube.com/base.js always returns 404.
  'www.youtube.com',
  'youtube.com',
  'youtubei.googleapis.com',
  // Google Bot / WAA telemetry probes
  'jnn-pa.googleapis.com',
  'play.google.com',
  // Common analytics / tag managers
  'www.google-analytics.com',
  'www.googletagmanager.com',
  'analytics.google.com',
  'stats.g.doubleclick.net',
  'connect.facebook.net',
  'www.facebook.com',
  'snap.licdn.com',
  'px.ads.linkedin.com',
]);
// Hosts where only specific path prefixes are real assets
const HOST_PATH_ALLOWLIST: Record<string, string[]> = {
  'framerusercontent.com': ['/images/', '/assets/', '/modules/'],
};

// Per-host path denylist (regex, applied if no allowlist matches).
// Use for hosts that ARE valid CDNs but contain known-stale paths inside
// their JS bundles (template strings, legacy structures, etc.).
const HOST_PATH_DENY_REGEX: Record<string, RegExp> = {
  // Webflow CDN: legacy /{siteId}/(fonts|images|videos|documents)/... paths
  // appear as string literals in bundled JS but always 403. Real assets are
  // served flat at /{siteId}/{filename}.
  'cdn.prod.website-files.com': /^\/[a-f0-9]{20,}\/(?:fonts|images|videos|documents)\//i,
  'uploads-ssl.webflow.com': /^\/[a-f0-9]{20,}\/(?:fonts|images|videos|documents)\//i,
};

export function isLikelyAssetUrl(raw: string): boolean {
  // Reject template literal placeholders (raw or URL-encoded)
  if (raw.includes('${') || raw.includes('%7B') || raw.includes('%7b')) return false;
  // Reject backslash-escape sequences (string literals, not real URLs)
  if (raw.includes('\\u') || raw.includes('\\x')) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  if (!u.hostname.includes('.')) return false;
  // Hostname must not look like a bare filename (e.g. "ga.js")
  if (/\.(?:js|mjs|css|json|png|jpe?g|svg|gif|webp|woff2?)$/i.test(u.hostname)) return false;
  // Host-specific allowlist (positive match)
  const allowed = HOST_PATH_ALLOWLIST[u.hostname];
  if (allowed) return allowed.some((p) => u.pathname.startsWith(p));
  if (NOISE_HOST_BLOCKLIST.has(u.hostname)) return false;
  // Host-specific path denylist (negative match)
  const deny = HOST_PATH_DENY_REGEX[u.hostname];
  if (deny && deny.test(u.pathname)) return false;
  return true;
}

function hashUrl(url: string): string {
  return createHash('md5').update(url).digest('hex').slice(0, 10);
}

export class AssetManager {
  private readonly assets: Map<string, AssetRecord> = new Map();
  private readonly visitedCss: Set<string> = new Set();
  private readonly limit: ReturnType<typeof pLimit>;
  private readonly concurrency: number;
  private readonly maxFileSize: number;
  private readonly timeout: number;
  private baseUrl = '';
  private readonly localPathCounts: Map<string, number> = new Map();
  // URLs whose local path is fixed (because a parent JS file imports them
  // via a relative specifier like "./dist/chunk-X.js" and we must keep the
  // dir layout for the import to resolve locally).
  private readonly pinnedLocalPath: Map<string, string> = new Map();

  constructor(config?: AssetManagerConfig) {
    this.concurrency = config?.concurrency ?? DEFAULT_CONCURRENCY;
    this.maxFileSize = config?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.timeout = config?.timeout ?? DEFAULT_TIMEOUT;
    this.limit = pLimit(this.concurrency);
  }

  categorizeAsset(url: string, contentType?: string): string {
    try {
      const parsed = new URL(url);
      const ext = extname(parsed.pathname).toLowerCase();
      if (ext && EXT_TO_CATEGORY[ext]) {
        return EXT_TO_CATEGORY[ext];
      }
    } catch {
      // fall through to content-type check
    }

    if (contentType) {
      const ct = contentType.toLowerCase();
      if (ct.startsWith('text/css')) return 'css';
      if (ct.startsWith('application/javascript') || ct.startsWith('text/javascript')) return 'js';
      if (ct.startsWith('image/')) return 'images';
      if (ct.startsWith('font/') || ct.includes('font')) return 'fonts';
      if (ct.startsWith('video/') || ct.startsWith('audio/')) return 'media';
    }

    return 'other';
  }

  getLocalPath(url: string): string {
    let filename = '';
    let ext = '';

    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1] ?? '';
      ext = extname(lastSegment).toLowerCase();

      if (lastSegment && ext) {
        // URL-decode iteratively so the on-disk filename matches what browsers
        // request after they decode the path. Some CDNs (Webflow) double-encode
        // filenames containing spaces (e.g. "Foo%2520Bar.png" -> "Foo Bar.png").
        // Stop when decoding is idempotent or after a small bound.
        let decoded = lastSegment;
        for (let i = 0; i < 3; i++) {
          let next: string;
          try {
            next = decodeURIComponent(decoded);
          } catch {
            break;
          }
          if (next === decoded) break;
          decoded = next;
        }
        filename = decoded;
      }
    } catch {
      // fall through
    }

    if (!filename) {
      const hash = hashUrl(url);
      filename = `asset-${hash}${ext || '.bin'}`;
    }

    const category = this.categorizeAsset(url);
    const basePath = `assets/${category}/${filename}`;

    const count = this.localPathCounts.get(basePath) ?? 0;
    if (count > 0) {
      const dotIdx = filename.lastIndexOf('.');
      const name = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
      const fileExt = dotIdx > 0 ? filename.slice(dotIdx) : '';
      const dedupPath = `assets/${category}/${name}-${count}${fileExt}`;
      this.localPathCounts.set(basePath, count + 1);
      return dedupPath;
    }

    this.localPathCounts.set(basePath, 1);
    return basePath;
  }

  async processPage(
    html: string,
    baseUrl: string,
    pageLocalPath?: string,
    seedUrls: string[] = []
  ): Promise<ProcessedPage> {
    this.baseUrl = baseUrl;

    const $ = cheerio.load(html, { xml: false } as cheerio.CheerioOptions);

    const urls = new Set<string>();

    // Seed with URLs discovered by the browser network listener (catches dynamic
    // imports, lazy chunks, runtime fetches that aren't in the static HTML).
    for (const seed of seedUrls) {
      if (!seed) continue;
      if (SKIP_SCHEMES.some((scheme) => seed.startsWith(scheme))) continue;
      // Only auto-include same-origin or asset-CDN URLs we can categorize
      if (!isAbsoluteUrl(seed)) continue;
      // Filter out telemetry/analytics/player-internal noise
      if (!isLikelyAssetUrl(seed)) continue;
      urls.add(seed);
    }

    const collectAttr = (selector: string, attr: string): void => {
      $(selector).each((_, el) => {
        const val = $(el).attr(attr);
        if (val) {
          const resolved = resolveUrl(val, baseUrl);
          if (resolved && resolved !== val.trim() || isAbsoluteUrl(resolved)) {
            urls.add(resolved);
          }
        }
      });
    };

    const collectSrcset = (selector: string): void => {
      $(selector).each((_, el) => {
        const val = $(el).attr('srcset');
        if (val) {
          try {
            const parsed = parseSrcset(val);
            for (const entry of parsed) {
              const resolved = resolveUrl(entry.url, baseUrl);
              if (resolved && isAbsoluteUrl(resolved)) {
                urls.add(resolved);
              }
            }
          } catch {
            logger.warn('Failed to parse srcset', { value: val });
          }
        }
      });
    };

    collectAttr('img[src]', 'src');
    collectAttr('img[data-src]', 'data-src');
    collectSrcset('img[srcset]');
    collectSrcset('source[srcset]');
    collectAttr('link[rel="stylesheet"][href]', 'href');
    collectAttr('link[rel="icon"][href]', 'href');
    collectAttr('link[rel="apple-touch-icon"][href]', 'href');
    collectAttr('link[rel="preload"][href]', 'href');
    collectAttr('script[src]', 'src');
    collectAttr('link[rel="modulepreload"][href]', 'href');
    collectAttr('video[src]', 'src');
    collectAttr('video[poster]', 'poster');
    collectAttr('source[src]', 'src');

    // Collect url() references from inline style attributes (e.g., background-image)
    $('[style]').each((_, el) => {
      const style = $(el).attr('style');
      if (!style || !style.includes('url(')) return;
      const parsed = valueParser(style);
      parsed.walk(node => {
        if (node.type !== 'function' || node.value !== 'url') return;
        const firstChild = node.nodes?.[0];
        if (!firstChild) return;
        let urlValue = '';
        if (firstChild.type === 'string') urlValue = firstChild.value;
        else if (firstChild.type === 'word') urlValue = firstChild.value;
        else return;
        if (urlValue.startsWith('data:') || urlValue.startsWith('blob:')) return;
        const resolved = resolveUrl(urlValue, baseUrl);
        if (resolved && isAbsoluteUrl(resolved)) {
          urls.add(resolved);
        }
      });
    });

    // Collect url() references from inline <style> tags
    $('style').each((_, el) => {
      const cssText = $(el).html();
      if (!cssText || !cssText.includes('url(')) return;
      const parsed = valueParser(cssText);
      parsed.walk(node => {
        if (node.type !== 'function' || node.value !== 'url') return;
        const firstChild = node.nodes?.[0];
        if (!firstChild) return;
        let urlValue = '';
        if (firstChild.type === 'string') urlValue = firstChild.value;
        else if (firstChild.type === 'word') urlValue = firstChild.value;
        else return;
        if (urlValue.startsWith('data:') || urlValue.startsWith('blob:')) return;
        const resolved = resolveUrl(urlValue, baseUrl);
        if (resolved && isAbsoluteUrl(resolved)) {
          urls.add(resolved);
        }
      });
    });

    await Promise.all(
      [...urls].map(url => this.limit(() => this.downloadAsset(url)))
    );

    // Scan downloaded JS bundles for additional asset URLs (e.g. lazy-loaded
    // route chunks referenced by string literal in Framer/Webpack/Vite output).
    // We do up to 2 passes because newly-downloaded chunks may reference more chunks.
    for (let pass = 0; pass < 2; pass++) {
      const newUrls = this.discoverUrlsInJsBundles(baseUrl);
      const fresh = [...newUrls].filter((u) => !this.assets.has(u));
      if (fresh.length === 0) break;
      logger.info(`Pass ${pass + 1}: discovered ${fresh.length} additional asset URLs in JS bundles`);
      await Promise.all(fresh.map((url) => this.limit(() => this.downloadAsset(url))));
    }

    // Process CSS files: download referenced sub-assets
    const cssAssets = [...this.assets.values()].filter(
      a => a.mimeType.includes('css') || a.localPath.startsWith('assets/css/')
    );
    for (const cssAsset of cssAssets) {
      const cssContent = cssAsset.content.toString('utf-8');
      const processed = await this.processCss(cssContent, cssAsset.url);
      cssAsset.content = Buffer.from(processed, 'utf-8');
    }

    // Process inline <style> tags: download url() refs and rewrite paths
    const styleElements = $('style').toArray();
    for (const el of styleElements) {
      const cssText = $(el).html();
      if (!cssText) continue;
      const processed = await this.processInlineCss(cssText, baseUrl, pageLocalPath);
      $(el).html(processed);
    }

    // Process inline style="" attributes: download and rewrite url() references
    const styledElements = $('[style]').toArray();
    for (const el of styledElements) {
      const style = $(el).attr('style');
      if (!style || !style.includes('url(')) continue;
      const rewritten = this.rewriteInlineStyle(style, pageLocalPath);
      $(el).attr('style', rewritten);
    }

    this.rewriteHtmlPaths($, pageLocalPath);

    return { html: $.html(), assets: this.assets };
  }

  async downloadAsset(url: string): Promise<AssetRecord | null> {
    if (this.assets.has(url)) {
      return this.assets.get(url)!;
    }

    for (const scheme of SKIP_SCHEMES) {
      if (url.startsWith(scheme)) {
        return null;
      }
    }

    // Final guard: don't bother fetching from known-noise hosts even if
    // they slipped past earlier filters (e.g. third-party scripts).
    if (!isLikelyAssetUrl(url)) {
      return null;
    }

    try {
      const safe = await isSafeUrl(url);
      if (!safe) {
        logger.warn('Skipping unsafe URL', { url });
        return null;
      }

      // Build headers that look like a real Chrome request. Some CDNs
      // (notably Webflow's cdn.prod.website-files.com) return 403 to bare
      // requests without a matching Referer/Origin or with an obviously
      // automated User-Agent.
      const ext = extname(new URL(url).pathname).toLowerCase();
      let accept = '*/*';
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)) {
        accept = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
      } else if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
        accept = 'font/woff2,font/woff,*/*;q=0.8';
      } else if (ext === '.css') {
        accept = 'text/css,*/*;q=0.1';
      } else if (ext === '.js' || ext === '.mjs') {
        accept = '*/*';
      }

      const headers: Record<string, string> = {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept,
        'accept-language': 'en-US,en;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
      };
      if (this.baseUrl) {
        try {
          const baseOrigin = new URL(this.baseUrl).origin;
          headers.referer = this.baseUrl;
          headers.origin = baseOrigin;
        } catch {
          /* ignore malformed baseUrl */
        }
      }

      const response = await got(url, {
        responseType: 'buffer',
        timeout: { request: this.timeout },
        headers,
        throwHttpErrors: true,
        followRedirect: true,
        decompress: true,
        retry: { limit: 1 },
      });

      const contentLength = parseInt(response.headers['content-length'] ?? '0', 10);
      if (contentLength > this.maxFileSize) {
        logger.warn('Skipping oversized asset', { url, size: contentLength });
        return null;
      }

      if (response.body.length > this.maxFileSize) {
        logger.warn('Skipping oversized asset (body)', { url, size: response.body.length });
        return null;
      }

      const contentType = response.headers['content-type'] ?? 'application/octet-stream';
      const localPath = this.pinnedLocalPath.get(url) ?? this.getLocalPath(url);

      const record: AssetRecord = {
        url,
        localPath,
        content: response.body,
        mimeType: contentType,
      };

      this.assets.set(url, record);
      logger.debug('Downloaded asset', { url, localPath });
      return record;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // 403/404 from third-party CDNs is common and non-fatal — downgrade to warn
      const isHttp4xx = /status code 4\d\d/.test(message);
      if (isHttp4xx) {
        logger.warn('Asset unavailable (skipped)', { url, error: message.split(':')[0] });
      } else {
        logger.error('Failed to download asset', { url, error: message });
      }
      return null;
    }
  }

  /**
   * Scan all downloaded JS bundles for additional asset URL references
   * (lazy-loaded chunks, dynamic imports, framework route maps).
   * Returns a Set of absolute URLs not yet downloaded.
   *
   * Side effect: for ES module relative imports (e.g. `import "./dist/x.js"`),
   * pins the discovered URL's local path to mirror the parent's directory
   * structure so the relative specifier still resolves after rewriting.
   */
  private discoverUrlsInJsBundles(baseUrl: string): Set<string> {
    const found = new Set<string>();
    // Match common asset extensions referenced as string literals inside JS.
    // Captures: 1) absolute URLs (https?://...) and 2) absolute-rooted paths
    // starting with / that look like build-output asset paths.
    const absRe = /https?:\/\/[^\s"'`<>()]+?\.(?:m?js|css|woff2?|ttf|otf|eot|json|wasm|png|jpe?g|gif|svg|webp|avif|mp4|webm|mp3|ogg)(?:\?[^\s"'`<>()]*)?/gi;
    const relRe = /["'`](\/[^\s"'`<>()]+?\.(?:m?js|css|woff2?|ttf|otf|wasm|json|png|jpe?g|gif|svg|webp|avif))(?:\?[^\s"'`<>()]*)?["'`]/gi;
    // ES module relative imports: import ... from "./x.js" / import("./x.js") /
    // import "./x.js" / from"./x.js". Only matches ./ or ../ specifiers.
    const esmImportRe = /(?:\bimport\s*(?:[\w*${},\s]+from\s*)?|\bimport\s*\(\s*|\bfrom\s*)["'`](\.{1,2}\/[^"'`?]+\.(?:m?js|css|json))(?:\?[^"'`]*)?["'`]/g;

    const isLikelyValidAssetUrl = (raw: string): boolean => isLikelyAssetUrl(raw);

    for (const asset of this.assets.values()) {
      const ct = asset.mimeType.toLowerCase();
      const isJs =
        ct.includes('javascript') ||
        ct.includes('ecmascript') ||
        asset.localPath.endsWith('.js') ||
        asset.localPath.endsWith('.mjs');
      if (!isJs) continue;

      let text: string;
      try {
        text = asset.content.toString('utf-8');
      } catch {
        continue;
      }
      // Skip very large bundles to keep regex cost bounded
      if (text.length > 5_000_000) continue;

      let m: RegExpExecArray | null;
      while ((m = absRe.exec(text)) !== null) {
        const u = m[0];
        if (this.assets.has(u)) continue;
        if (!isLikelyValidAssetUrl(u)) continue;
        found.add(u);
      }
      while ((m = relRe.exec(text)) !== null) {
        const path = m[1];
        // Reject template placeholders in relative paths too
        if (path.includes('${') || path.includes('%7B') || path.includes('\\u')) continue;
        try {
          const resolved = new URL(path, asset.url).toString();
          if (this.assets.has(resolved)) continue;
          if (!isLikelyValidAssetUrl(resolved)) continue;
          found.add(resolved);
        } catch {
          /* ignore */
        }
      }
      // ES module relative imports: resolve against parent's URL AND pin the
      // local path so the relative specifier keeps working after we save.
      const parentLocalDir = posix.dirname(asset.localPath);
      while ((m = esmImportRe.exec(text)) !== null) {
        const spec = m[1]; // e.g. "./dist/chunk-X.js" or "../utils.js"
        if (spec.includes('${') || spec.includes('\\u')) continue;
        let resolvedUrl: string;
        try {
          resolvedUrl = new URL(spec, asset.url).toString();
        } catch {
          continue;
        }
        if (!isLikelyValidAssetUrl(resolvedUrl)) continue;
        // Compute pinned local path mirroring the relative specifier so the
        // original import keeps resolving without rewriting the JS source.
        const cleanSpec = spec.replace(/^\.\//, '');
        const pinned = posix.normalize(posix.join(parentLocalDir, cleanSpec));
        // Safety: don't escape the assets/ root
        if (!pinned.startsWith('assets/')) continue;

        const existing = this.assets.get(resolvedUrl);
        if (existing) {
          // Already downloaded (e.g. by the browser network listener during
          // crawl) but stored at the flat default path. Rehome it so the
          // ./dist/chunk-X.js import still resolves locally.
          if (existing.localPath !== pinned) {
            existing.localPath = pinned;
          }
          continue;
        }
        if (!this.pinnedLocalPath.has(resolvedUrl)) {
          this.pinnedLocalPath.set(resolvedUrl, pinned);
        }
        found.add(resolvedUrl);
      }
    }
    return found;
  }

  rewriteHtmlPaths($: cheerio.CheerioAPI, pageLocalPath?: string): void {
    const rewriteAttr = (selector: string, attr: string): void => {
      $(selector).each((_, el) => {
        const val = $(el).attr(attr);
        if (!val) return;
        const resolved = resolveUrl(val, this.baseUrl);
        const record = this.assets.get(resolved);
        if (record) {
          const path = pageLocalPath ? getRelativePath(pageLocalPath, record.localPath) : record.localPath;
          $(el).attr(attr, path);
        }
      });
    };

    rewriteAttr('img[src]', 'src');
    rewriteAttr('img[data-src]', 'data-src');
    rewriteAttr('script[src]', 'src');
    rewriteAttr('video[src]', 'src');
    rewriteAttr('source[src]', 'src');
    rewriteAttr('video[poster]', 'poster');
    rewriteAttr('link[rel="stylesheet"][href]', 'href');
    rewriteAttr('link[rel="modulepreload"][href]', 'href');
    rewriteAttr('link[rel="icon"][href]', 'href');
    rewriteAttr('link[rel="apple-touch-icon"][href]', 'href');
    rewriteAttr('link[rel="preload"][href]', 'href');

    const rewriteSrcset = (selector: string): void => {
      $(selector).each((_, el) => {
        const val = $(el).attr('srcset');
        if (!val) return;
        try {
          const parsed = parseSrcset(val);
          const rewritten = parsed.map(entry => {
            const resolved = resolveUrl(entry.url, this.baseUrl);
            const record = this.assets.get(resolved);
            return {
              url: record ? (pageLocalPath ? getRelativePath(pageLocalPath, record.localPath) : record.localPath) : entry.url,
              ...(entry.width !== undefined ? { width: entry.width } : {}),
              ...(entry.density !== undefined ? { density: entry.density } : {}),
            };
          });
          $(el).attr('srcset', stringifySrcset(rewritten));
        } catch {
          logger.warn('Failed to rewrite srcset', { value: val });
        }
      });
    };

    rewriteSrcset('img[srcset]');
    rewriteSrcset('source[srcset]');
  }

  /**
   * Process inline <style> CSS: download url() assets and rewrite paths relative to the HTML page.
   */
  async processInlineCss(cssText: string, baseUrl: string, pageLocalPath?: string): Promise<string> {
    let root: postcss.Root;
    try {
      root = postcss.parse(cssText);
    } catch {
      logger.warn('Failed to parse inline <style> CSS');
      return cssText;
    }

    const htmlDir = pageLocalPath ? pageLocalPath.split('/').slice(0, -1).join('/') : '';

    // First pass: collect all url() references
    const urlsToDownload: string[] = [];
    root.walkDecls(decl => {
      if (!decl.value.includes('url(')) return;
      const parsed = valueParser(decl.value);
      parsed.walk(node => {
        if (node.type !== 'function' || node.value !== 'url') return;
        const firstChild = node.nodes?.[0];
        if (!firstChild) return;
        let urlValue = '';
        if (firstChild.type === 'string') urlValue = firstChild.value;
        else if (firstChild.type === 'word') urlValue = firstChild.value;
        else return;
        if (urlValue.startsWith('data:') || urlValue.startsWith('blob:')) return;
        const resolved = resolveUrl(urlValue, baseUrl);
        if (resolved && isAbsoluteUrl(resolved) && !this.assets.has(resolved)) {
          urlsToDownload.push(resolved);
        }
      });
    });

    // Download missing assets
    if (urlsToDownload.length > 0) {
      await Promise.all(
        urlsToDownload.map(url => this.limit(() => this.downloadAsset(url)))
      );
    }

    // Rewrite all url() paths relative to the HTML page
    root.walkDecls(decl => {
      if (!decl.value.includes('url(')) return;
      const parsed = valueParser(decl.value);
      parsed.walk(node => {
        if (node.type !== 'function' || node.value !== 'url') return;
        const firstChild = node.nodes?.[0];
        if (!firstChild) return;
        let urlValue = '';
        if (firstChild.type === 'string') urlValue = firstChild.value;
        else if (firstChild.type === 'word') urlValue = firstChild.value;
        else return;
        if (urlValue.startsWith('data:') || urlValue.startsWith('blob:')) return;
        const resolved = resolveUrl(urlValue, baseUrl);
        if (!resolved || !isAbsoluteUrl(resolved)) return;
        const record = this.assets.get(resolved);
        if (record) {
          const relativePath = htmlDir ? posix.relative(htmlDir, record.localPath) : record.localPath;
          firstChild.value = relativePath;
          if (firstChild.type === 'string') {
            firstChild.quote = "'";
          }
        }
      });
      decl.value = valueParser.stringify(parsed.nodes);
    });

    return root.toString();
  }

  /**
   * Rewrite url() references in an inline style attribute to local paths.
   */
  rewriteInlineStyle(style: string, pageLocalPath?: string): string {
    const htmlDir = pageLocalPath ? pageLocalPath.split('/').slice(0, -1).join('/') : '';
    const parsed = valueParser(style);
    parsed.walk(node => {
      if (node.type !== 'function' || node.value !== 'url') return;
      const firstChild = node.nodes?.[0];
      if (!firstChild) return;
      let urlValue = '';
      if (firstChild.type === 'string') urlValue = firstChild.value;
      else if (firstChild.type === 'word') urlValue = firstChild.value;
      else return;
      if (urlValue.startsWith('data:') || urlValue.startsWith('blob:')) return;
      const resolved = resolveUrl(urlValue, this.baseUrl);
      if (!resolved || !isAbsoluteUrl(resolved)) return;
      const record = this.assets.get(resolved);
      if (record) {
        const relativePath = htmlDir ? posix.relative(htmlDir, record.localPath) : record.localPath;
        firstChild.value = relativePath;
        if (firstChild.type === 'string') {
          firstChild.quote = "'";
        }
      }
    });
    return valueParser.stringify(parsed.nodes);
  }

  async processCss(cssContent: string, cssUrl: string, depth = 0): Promise<string> {
    if (depth > 10) {
      logger.warn('Max CSS recursion depth reached', { cssUrl, depth });
      return cssContent;
    }

    if (this.visitedCss.has(cssUrl)) {
      return cssContent;
    }
    this.visitedCss.add(cssUrl);

    let root: postcss.Root;
    try {
      root = postcss.parse(cssContent, { from: cssUrl });
    } catch {
      logger.warn('Failed to parse CSS', { cssUrl });
      return cssContent;
    }

    // Handle @import rules
    const importNodes: postcss.AtRule[] = [];
    root.walkAtRules('import', rule => {
      importNodes.push(rule);
    });

    for (const rule of importNodes) {
      const importUrl = extractImportUrl(rule.params);
      if (!importUrl) continue;

      const resolvedUrl = resolveUrl(importUrl, cssUrl);
      if (!resolvedUrl || !isAbsoluteUrl(resolvedUrl)) continue;

      const record = await this.downloadAsset(resolvedUrl);
      if (record) {
        const importedContent = record.content.toString('utf-8');
        const processed = await this.processCss(importedContent, resolvedUrl, depth + 1);

        try {
          const importedRoot = postcss.parse(processed);
          rule.replaceWith(importedRoot.nodes ?? []);
        } catch {
          rule.replaceWith(postcss.parse(processed));
        }
      }
    }

    // Compute CSS file's local directory for relative path resolution
    const cssRecord = this.assets.get(cssUrl);
    const cssLocalDir = cssRecord ? cssRecord.localPath.split('/').slice(0, -1).join('/') : 'assets/css';

    // Handle url() in declarations
    root.walkDecls(decl => {
      if (!decl.value.includes('url(')) return;

      const parsed = valueParser(decl.value);

      parsed.walk(node => {
        if (node.type !== 'function' || node.value !== 'url') return;

        const firstChild = node.nodes?.[0];
        if (!firstChild) return;

        let urlValue = '';
        if (firstChild.type === 'string') {
          urlValue = firstChild.value;
        } else if (firstChild.type === 'word') {
          urlValue = firstChild.value;
        } else {
          return;
        }

        if (urlValue.startsWith('data:')) return;
        if (urlValue.startsWith('blob:')) return;

        const resolvedUrl = resolveUrl(urlValue, cssUrl);
        if (!resolvedUrl || !isAbsoluteUrl(resolvedUrl)) return;

        const record = this.assets.get(resolvedUrl);
        if (record) {
          firstChild.value = posix.relative(cssLocalDir, record.localPath);
          if (firstChild.type === 'string') {
            firstChild.quote = "'";
          }
        }
      });

      decl.value = valueParser.stringify(parsed.nodes);
    });

    // Second pass: download url() assets that weren't already downloaded
    const urlDownloads: Array<{ resolvedUrl: string }> = [];
    root.walkDecls(decl => {
      if (!decl.value.includes('url(')) return;

      const parsed = valueParser(decl.value);
      parsed.walk(node => {
        if (node.type !== 'function' || node.value !== 'url') return;
        const firstChild = node.nodes?.[0];
        if (!firstChild) return;

        let urlValue = '';
        if (firstChild.type === 'string') urlValue = firstChild.value;
        else if (firstChild.type === 'word') urlValue = firstChild.value;
        else return;

        if (urlValue.startsWith('data:') || urlValue.startsWith('blob:')) return;

        const resolvedUrl = resolveUrl(urlValue, cssUrl);
        if (!resolvedUrl || !isAbsoluteUrl(resolvedUrl)) return;
        if (!this.assets.has(resolvedUrl)) {
          urlDownloads.push({ resolvedUrl });
        }
      });
    });

    if (urlDownloads.length > 0) {
      await Promise.all(
        urlDownloads.map(({ resolvedUrl }) => this.limit(() => this.downloadAsset(resolvedUrl)))
      );

      // Rewrite again after downloading
      root.walkDecls(decl => {
        if (!decl.value.includes('url(')) return;

        const parsed = valueParser(decl.value);
        parsed.walk(node => {
          if (node.type !== 'function' || node.value !== 'url') return;
          const firstChild = node.nodes?.[0];
          if (!firstChild) return;

          let urlValue = '';
          if (firstChild.type === 'string') urlValue = firstChild.value;
          else if (firstChild.type === 'word') urlValue = firstChild.value;
          else return;

          if (urlValue.startsWith('data:') || urlValue.startsWith('blob:')) return;

          const resolvedUrl = resolveUrl(urlValue, cssUrl);
          if (!resolvedUrl || !isAbsoluteUrl(resolvedUrl)) return;

          const record = this.assets.get(resolvedUrl);
          if (record) {
            firstChild.value = posix.relative(cssLocalDir, record.localPath);
            if (firstChild.type === 'string') {
              firstChild.quote = "'";
            }
          }
        });

        decl.value = valueParser.stringify(parsed.nodes);
      });
    }

    return root.toString();
  }
}

function isAbsoluteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function extractImportUrl(params: string): string | null {
  const trimmed = params.trim();

  // Handle url("...") or url('...') or url(...)
  const urlMatch = trimmed.match(/^url\(\s*(['"]?)(.+?)\1\s*\)/);
  if (urlMatch) {
    return urlMatch[2] ?? null;
  }

  // Handle "..." or '...'
  const quoteMatch = trimmed.match(/^(['"])(.+?)\1/);
  if (quoteMatch) {
    return quoteMatch[2] ?? null;
  }

  return null;
}

export default AssetManager;
