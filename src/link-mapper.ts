import * as cheerio from 'cheerio';
import { getRelativePath } from './utils/slugify.js';
import { resolveUrl } from './utils/url-resolver.js';

const SKIP_SCHEMES = ['javascript:', 'mailto:', 'tel:', 'data:', 'blob:'];

function normalizeUrlForLookup(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    // Remove trailing slash unless it's just the origin
    let normalized = parsed.href;
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

export function remapLinks(
  html: string,
  currentPageLocalPath: string,
  pageMap: Map<string, string>,
  siteBaseUrl: string,
): string {
  const $ = cheerio.load(html, { xml: false } as cheerio.CheerioOptions);

  // Pre-compute the current page's normalized URL for same-page detection
  let currentPageUrl: string | undefined;
  for (const [url, localPath] of pageMap) {
    if (localPath === currentPageLocalPath) {
      currentPageUrl = normalizeUrlForLookup(url);
      break;
    }
  }

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href || !href.trim()) return;

    // Skip non-navigable schemes
    const hrefLower = href.toLowerCase();
    for (const scheme of SKIP_SCHEMES) {
      if (hrefLower.startsWith(scheme)) return;
    }

    // Extract hash fragment before resolving
    let fragment = '';
    const hashIndex = href.indexOf('#');
    if (hashIndex !== -1) {
      fragment = href.slice(hashIndex); // includes the '#'
    }

    // Get the base portion (without fragment)
    const hrefBase = hashIndex !== -1 ? href.slice(0, hashIndex) : href;

    // Pure anchor link on the same page — leave as-is
    if (!hrefBase) {
      return;
    }

    // Resolve against site base URL (resolveUrl strips hash already)
    const resolved = resolveUrl(hrefBase, siteBaseUrl);

    // If resolveUrl returned it unchanged (non-http scheme, etc.), skip
    if (resolved === hrefBase && !hrefBase.startsWith('http')) {
      return;
    }

    // Normalize for lookup
    const normalized = normalizeUrlForLookup(resolved);

    // Try lookup with and without trailing slash
    let targetLocalPath = pageMap.get(normalized);
    if (!targetLocalPath) {
      const withSlash = normalized.endsWith('/') ? normalized : normalized + '/';
      const withoutSlash = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
      targetLocalPath = pageMap.get(withSlash) || pageMap.get(withoutSlash);
    }

    if (!targetLocalPath) return; // External link — leave unchanged

    // Same-page anchor optimization
    if (fragment && currentPageUrl && normalized === currentPageUrl) {
      $(el).attr('href', fragment);
      return;
    }

    // Compute relative path from current page to target
    const relativePath = getRelativePath(currentPageLocalPath, targetLocalPath);
    $(el).attr('href', relativePath + fragment);
  });

  return $.html();
}
