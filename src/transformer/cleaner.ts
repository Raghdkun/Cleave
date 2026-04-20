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
  // Preserve data-framer attributes that CSS selectors depend on
  const FRAMER_KEEP_ATTRS = new Set([
    'data-framer-component-type',
    'data-framer-cursor',
    'data-framer-generated',
    'data-framer-name',
  ]);
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

  // --- Reset Framer appear-animation initial states ---
  // Framer SSR renders scroll-triggered elements with opacity:0 + transform offsets.
  // Without the JS runtime, they stay invisible. Reset them to visible.
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
