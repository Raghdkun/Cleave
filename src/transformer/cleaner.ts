import * as cheerio from 'cheerio';

interface DomElement {
  attribs: Record<string, string>;
  tagName?: string;
}

function isElement(node: unknown): node is DomElement {
  return node != null && typeof node === 'object' && 'attribs' in node;
}

export function clean(html: string): string {
  const $ = cheerio.load(html);

  // --- Webflow artifacts ---
  $('*').each(function () {
    if (!isElement(this)) return;
    const el = $(this);
    const attribs = this.attribs;
    for (const attr of Object.keys(attribs)) {
      if (
        attr.startsWith('data-wf-') ||
        attr === 'data-w-id' ||
        attr === 'data-wf-domain' ||
        attr === 'data-wf-page' ||
        attr === 'data-wf-site'
      ) {
        el.removeAttr(attr);
      }
    }
  });

  $('script').each(function () {
    const el = $(this);
    const src = el.attr('src') ?? '';
    if (/webflow/i.test(src)) {
      el.remove();
      return;
    }
    const content = el.html() ?? '';
    if (content.includes('Webflow')) {
      el.remove();
    }
  });

  $('.w-webflow-badge').remove();
  $('[class*="w-webflow-badge"]').remove();

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

  $('[class*="__framer-"], [id*="__framer-"]').remove();

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
