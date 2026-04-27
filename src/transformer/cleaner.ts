import * as cheerio from 'cheerio';

interface DomElement {
  attribs: Record<string, string>;
  tagName?: string;
}

function buildAnalyticsStubScript(): string {
  return `(() => {
  const analytics = window.analytics && typeof window.analytics === 'object'
    ? window.analytics
    : [];

  window.analytics = analytics;

  if (typeof analytics.track === 'function') {
    return;
  }

  analytics.invoked = true;
  analytics.initialize = true;
  analytics.SNIPPET_VERSION = analytics.SNIPPET_VERSION || 'cleave-stub';

  const methods = [
    'trackSubmit',
    'trackClick',
    'trackLink',
    'trackForm',
    'pageview',
    'identify',
    'reset',
    'group',
    'track',
    'ready',
    'alias',
    'debug',
    'page',
    'once',
    'off',
    'on',
    'addSourceMiddleware',
    'addIntegrationMiddleware',
    'setAnonymousId',
    'addDestinationMiddleware',
    'load',
  ];

  const noop = () => analytics;

  for (const method of methods) {
    if (typeof analytics[method] !== 'function') {
      analytics[method] = noop;
    }
  }
})();`;
}

function buildMarketplaceFallbackScript(fallbackData: unknown[]): string {
  const serialized = JSON.stringify(fallbackData);
  return `(() => {
  const payload = ${serialized};
  const sourceOrigin = 'https://webflow.com';
  const matchesMarketplaceFeed = (url) => typeof url === 'string' && url.includes('/api/v1/marketplace/made-in-webflow/feed/');
  const matchesFeatureConfig = (url) => typeof url === 'string' && url.includes('/api/feature-config/config/marketplace-client');
  const originalFetch = window.fetch?.bind(window);
  if (!originalFetch) return;

  let cachedFeatureConfig;

  const getFeatureConfig = () => {
    if (cachedFeatureConfig !== undefined) {
      return cachedFeatureConfig;
    }

    try {
      const nextDataElement = document.getElementById('__NEXT_DATA__');
      const nextData = nextDataElement?.textContent ? JSON.parse(nextDataElement.textContent) : null;
      cachedFeatureConfig = nextData?.props?.pageProps?.sessionContext?.featureConfig ?? null;
    } catch {
      cachedFeatureConfig = null;
    }

    return cachedFeatureConfig;
  };

  const rewriteLinks = () => {
    document.querySelectorAll('a[href^="/"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('/#') || href.startsWith('/assets') || href.startsWith('/api/')) {
        return;
      }
      link.setAttribute('href', new URL(href, sourceOrigin).toString());
    });
  };

  rewriteLinks();
  new MutationObserver(rewriteLinks).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input && typeof input === 'object' && 'url' in input
        ? String(input.url)
        : '';

    if (matchesMarketplaceFeed(url)) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (matchesFeatureConfig(url)) {
      const featureConfig = getFeatureConfig();

      if (featureConfig) {
        return new Response(JSON.stringify(featureConfig), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return originalFetch(input, init);
  };
})();`;
}

function isElement(node: unknown): node is DomElement {
  return node != null && typeof node === 'object' && 'attribs' in node;
}

export function clean(html: string): string {
  const $ = cheerio.load(html);

  // --- Webflow artifacts ---
  // Preserve Webflow runtime attributes and scripts. They are required for IX2,
  // component state, and layout re-initialization in the exported page.

  const webflowNoiseSrcPatterns = [
    'madkudu',
    'intellimize',
    'analytics.min.js',
    'marketing-head-v2.js',
    'marketing-body-v2',
    'airgap.js',
    'shim.js',
    'segment.com/analytics',
    'partnerstack',
  ];
  const webflowNoiseInlinePatterns = [
    'intellimize',
    'anti-flicker',
    'madkudu',
    'partnerstack',
    'report-uri.com',
    'reportOnly',
    'wf_utils',
    'e.wf={r:s.r,ready',
    'window.analytics=window.analytics||[]',
    'analytics.load=function',
    'analytics.webflow.com/analytics.js',
  ];

  $('.w-webflow-badge').remove();
  $('[class*="w-webflow-badge"]').remove();

  $('iframe[src]').each(function () {
    const src = $(this).attr('src') ?? '';
    if (/intellimize|\/dashboard\/signup-modal/i.test(src)) {
      $(this).remove();
    }
  });

  $('*').each(function () {
    if (!isElement(this)) return;
    const el = $(this);
    for (const attr of Object.keys(this.attribs)) {
      if (
        attr === 'data-wf-intellimize-customer-id' ||
        attr === 'data-wf-experiences' ||
        attr.startsWith('data-intellimize-')
      ) {
        el.removeAttr(attr);
      }
    }
  });

  $('meta').each(function () {
    const el = $(this);
    const httpEquiv = (el.attr('http-equiv') ?? '').toLowerCase();
    const content = el.attr('content') ?? '';
    if (
      httpEquiv === 'content-security-policy-report-only' ||
      /report-uri|report-to/i.test(content)
    ) {
      el.remove();
    }
  });

  $('link[href]').each(function () {
    const href = $(this).attr('href') ?? '';
    if (/intellimize|report-uri|(?:^|\/)assets\/js\/\d+\.js$/i.test(href)) {
      $(this).remove();
    }
  });

  $('style').each(function () {
    const el = $(this);
    const id = el.attr('id') ?? '';
    const content = el.html() ?? '';
    if (/intellimize/i.test(id) || /intellimize|anti-flicker/i.test(content)) {
      el.remove();
    }
  });

  let needsAnalyticsStub = false;

  $('script').each(function () {
    const el = $(this);
    const src = el.attr('src') ?? '';
    const content = el.html() ?? '';
    const removesAnalyticsBootstrap =
      src.includes('analytics.min.js') ||
      content.includes('window.analytics=window.analytics||[]') ||
      content.includes('analytics.load=function') ||
      content.includes('analytics.webflow.com/analytics.js');

    if (
      el.attr('data-airgap-id') ||
      /(?:^|\/)assets\/js\/\d+\.js$/i.test(src) ||
      webflowNoiseSrcPatterns.some((pattern) => src.includes(pattern)) ||
      webflowNoiseInlinePatterns.some((pattern) => content.includes(pattern))
    ) {
      needsAnalyticsStub ||= removesAnalyticsBootstrap;
      el.remove();
    }
  });

  if (needsAnalyticsStub && $('script[data-cleave-analytics-stub]').length === 0) {
    const stub = `<script data-cleave-analytics-stub="true">${buildAnalyticsStubScript()}</script>`;
    if ($('head').length > 0) {
      $('head').prepend(stub);
    } else {
      $.root().prepend(stub);
    }
  }

  $('script#__NEXT_DATA__').each(function () {
    const el = $(this);
    const content = el.html() ?? '';
    if (!content.trim()) return;

    try {
      const data = JSON.parse(content) as {
        assetPrefix?: string;
        page?: string;
        props?: { pageProps?: { fallbackData?: unknown[] } };
        scriptLoader?: Array<{ src?: string }>;
      };
      if (typeof data.assetPrefix === 'string' && data.assetPrefix.startsWith('/')) {
        data.assetPrefix = data.assetPrefix.slice(1);
      }

      const fallbackData = data.props?.pageProps?.fallbackData;
      if (
        data.page === '/made-in-webflow/[...slugs]' &&
        Array.isArray(fallbackData) &&
        fallbackData.length > 0
      ) {
        el.after(`<script data-cleave-marketplace-fallback="true">${buildMarketplaceFallbackScript(fallbackData)}</script>`);
      }

      if (!Array.isArray(data.scriptLoader)) {
        el.text(JSON.stringify(data));
        return;
      }

      data.scriptLoader = data.scriptLoader.filter((entry) => {
        const src = entry?.src ?? '';
        return !webflowNoiseSrcPatterns.some((pattern) => src.includes(pattern));
      });

      el.text(JSON.stringify(data));
    } catch {
      // Ignore malformed or non-JSON Next metadata.
    }
  });

  // --- Wix artifacts ---
  $('*').each(function () {
    if (!isElement(this)) return;
    const el = $(this);
    const attribs = this.attribs;
    for (const attr of Object.keys(attribs)) {
      if (
        attr === 'data-mesh-id' ||
        attr === 'data-testid' ||
        attr === 'data-hook' ||
        attr.startsWith('corvid-')
      ) {
        el.removeAttr(attr);
      }
    }
  });

  $('*').each(function () {
    if (!isElement(this)) return;
    const tagName = this.tagName ?? '';
    if (tagName.startsWith('wix-')) {
      $(this).remove();
    }
  });

  $('script, style').each(function () {
    const content = $(this).html() ?? '';
    if (/wix|_wixCssModules/i.test(content)) {
      $(this).remove();
    }
  });

  // --- Framer artifacts ---
  // Detect whether the Framer JS runtime is being preserved in the export.
  // If yes, we MUST NOT strip data-framer-* attributes (the runtime uses them
  // to identify elements) and MUST NOT reset initial opacity/transform styles
  // (the runtime needs the SSR-rendered hidden state to animate FROM).
  // If no Framer runtime is present, fall back to the old static-snapshot
  // behaviour so the page is at least visible without JS.
  let framerRuntimePresent = false;
  $('script[src]').each(function () {
    const src = $(this).attr('src') ?? '';
    // Match local copies of Framer runtime (script_main, framer.*.mjs,
    // motion.*.mjs, react.*.mjs, render-*.mjs, chunk-*.mjs from Framer build)
    if (
      /script_main|framer\.[A-Za-z0-9_-]+\.mjs|motion\.[A-Za-z0-9_-]+\.mjs|render-[A-Z0-9]+\.mjs/.test(src) ||
      /\/(?:assets\/js|js)\/chunk-[A-Z0-9]+\.mjs$/.test(src)
    ) {
      framerRuntimePresent = true;
    }
  });
  // Also check inline scripts for framer runtime markers
  if (!framerRuntimePresent) {
    $('script:not([src])').each(function () {
      const content = $(this).html() ?? '';
      if (/__framer_|framer\.com\/edit\/init/i.test(content)) {
        framerRuntimePresent = true;
      }
    });
  }

  // Preserve data-framer attributes that CSS selectors depend on
  const FRAMER_KEEP_ATTRS = new Set([
    'data-framer-component-type',
    'data-framer-cursor',
    'data-framer-generated',
    'data-framer-name',
  ]);
  if (!framerRuntimePresent) {
    $('*').each(function () {
      if (!isElement(this)) return;
      const el = $(this);
      const attribs = this.attribs;
      for (const attr of Object.keys(attribs)) {
        if (attr.startsWith('data-framer-') && !FRAMER_KEEP_ATTRS.has(attr)) {
          el.removeAttr(attr);
        }
      }
    });
  }

  // --- Reset Framer appear-animation initial states ---
  // ONLY when the Framer JS runtime is NOT preserved. With the runtime present,
  // resetting opacity/transform here would prevent the runtime from animating
  // elements in (they would already be at the final state).
  if (!framerRuntimePresent) {
    $('*').each(function () {
      if (!isElement(this)) return;
      const style = this.attribs['style'];
      if (!style) return;
      if (/opacity\s*:\s*0/.test(style) && /transform\s*:/.test(style)) {
        const fixed = style
          .replace(/opacity\s*:\s*0/g, 'opacity: 1')
          .replace(/transform\s*:[^;]+/g, 'transform: none');
        $(this).attr('style', fixed);
      }
    });
  }

  if (!framerRuntimePresent) {
    $('[class*="__framer-"], [id*="__framer-"]').remove();
  }

  $('a').each(function () {
    const el = $(this);
    if ((el.text() ?? '').includes('Made with Framer')) {
      el.remove();
    }
  });

  // Remove Framer search-index meta tags (not useful offline)
  $('meta[name="framer-search-index"], meta[name="framer-search-index-fallback"]').remove();

  // Remove preconnect/dns-prefetch hints to external CDNs (assets are now local)
  $('link[rel="preconnect"], link[rel="dns-prefetch"]').each(function () {
    const href = $(this).attr('href') ?? '';
    if (/fonts\.gstatic|fonts\.googleapis|framerusercontent|gstatic\.com/i.test(href)) {
      $(this).remove();
    }
  });

  // --- Analytics / tracking removal ---
  const trackingScriptSrcPatterns = [
    'googletagmanager',
    'google-analytics',
    'gtag/js',
    'fbevents',
    'connect.facebook',
    'widget.intercom',
    'js.driftt',
    'client.crisp',
    'hotjar',
    'clarity.ms',
  ];

  const trackingInlinePatterns = [
    'gtag(',
    'fbq(',
    '_gaq',
    'dataLayer.push',
    "ga('",
    'ga("',
    'intercomSettings',
    'Intercom(',
  ];

  const trackingNoscriptDomains = [
    'googletagmanager',
    'facebook',
    'doubleclick',
  ];

  $('script').each(function () {
    const el = $(this);
    const src = el.attr('src') ?? '';
    if (src && trackingScriptSrcPatterns.some((p) => src.includes(p))) {
      el.remove();
      return;
    }
    const content = el.html() ?? '';
    if (content && trackingInlinePatterns.some((p) => content.includes(p))) {
      el.remove();
    }
  });

  $('noscript').each(function () {
    const el = $(this);
    const inner = el.html() ?? '';
    if (trackingNoscriptDomains.some((d) => inner.includes(d))) {
      const hasImg = /\bsrc\s*=/.test(inner);
      if (hasImg) {
        el.remove();
      }
    }
  });

  return $.html();
}
