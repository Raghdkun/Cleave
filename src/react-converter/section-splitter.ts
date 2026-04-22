import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

export interface Section {
  /** Component name in PascalCase, unique within the page (e.g. `Header`, `Hero`, `Section3Features`). */
  name: string;
  /** File name (without extension), kebab-style is fine. */
  fileName: string;
  /** Raw outer HTML of the section's root element(s) — fed to dangerouslySetInnerHTML. */
  html: string;
}

export interface SplitResult {
  /** Sections in render order. */
  sections: Section[];
  /** HTML to put into <head> via layout.tsx (raw children of <head>, minus the dynamic title/meta we inject). */
  headHtml: string;
  /** Page <title> if present. */
  title: string;
  /** Body class string (preserved on <body> in layout.tsx). */
  bodyClass: string;
  /** Body data-* attributes preserved as a record, e.g. { 'data-wf-page': '...' } */
  bodyAttrs: Record<string, string>;
  /** Raw HTML of <script>/<noscript>/<style> tags that lived directly under <body>
   *  (e.g. webflow.js, jquery loader, GA snippet). Re-emitted at the end of <body>
   *  in layout.tsx so runtime JS keeps loading after sections render. */
  bodyScriptsHtml: string;
}

/**
 * Heuristics for naming a section by inspecting tag/id/class.
 * Keeps names short, alphanumeric, PascalCase.
 */
function deriveSectionName(el: Element, index: number, used: Set<string>): string {
  const tag = el.tagName?.toLowerCase() ?? 'div';
  const id = el.attribs?.id ?? '';
  const cls = el.attribs?.class ?? '';

  // Special-case semantic tags
  if (tag === 'header') return uniquify('Header', used);
  if (tag === 'footer') return uniquify('Footer', used);
  if (tag === 'nav') return uniquify('Nav', used);
  if (tag === 'main') return uniquify('Main', used);

  // Try id first (e.g. id="hero" -> Hero)
  const fromId = pickHint(id);
  if (fromId) return uniquify(fromId, used);

  // Try class — pick first meaningful token
  const fromClass = pickHint(cls);
  if (fromClass) return uniquify(`${fromClass}Section`, used);

  return uniquify(`Section${index + 1}`, used);
}

function pickHint(raw: string): string | null {
  if (!raw) return null;
  // Take first whitespace-separated token, strip noisy prefixes
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) =>
      t
        .replace(/^w-/, '')
        .replace(/^wf-/, '')
        .replace(/^webflow-/, '')
        .replace(/^section-/, '')
        .replace(/-section$/, '')
        .replace(/^block-/, '')
        .trim(),
    )
    .filter((t) => t && /^[a-z][a-z0-9-]*$/i.test(t) && t.length > 1 && t.length < 32);
  if (tokens.length === 0) return null;
  return toPascalCase(tokens[0]);
}

function toPascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function uniquify(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(`${name}${i}`)) i++;
  const out = `${name}${i}`;
  used.add(out);
  return out;
}

function pascalToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Identifies whether an element is a plausible "page section" — either a semantic
 * landmark tag, OR a div/aside whose id/class contains a recognised section keyword
 * (Webflow's HTML rarely uses <section>; it leans on classes like `.section_hero`).
 */
const SECTION_CLASS_PATTERNS = [
  /(^|[\s_-])(header|navbar|nav)([\s_-]|$)/i,
  /(^|[\s_-])(footer)([\s_-]|$)/i,
  /(^|[\s_-])(hero|banner)([\s_-]|$)/i,
  /(^|[\s_-])(section)([\s_-]|$)/i,
  /(^|[\s_-])(cta|call[-_]?to[-_]?action)([\s_-]|$)/i,
  /(^|[\s_-])(features?|services?|portfolio|gallery|testimonials?|pricing|faq|blog|contact|about|team)([\s_-]|$)/i,
  /(^|[\s_-])(slider|carousel)([\s_-]|$)/i,
];

function isSectionLike(el: Element): boolean {
  const tag = el.tagName?.toLowerCase() ?? '';
  if (tag === 'header' || tag === 'footer' || tag === 'nav' || tag === 'main' || tag === 'section' || tag === 'aside') {
    return true;
  }
  if (tag !== 'div') return false;
  const haystack = `${el.attribs?.id ?? ''} ${el.attribs?.class ?? ''}`;
  return SECTION_CLASS_PATTERNS.some((re) => re.test(haystack));
}

/**
 * Splits the body of a Cleave-cleaned HTML document into named sections suitable for
 * conversion into per-component .tsx files. Each section preserves the exact original
 * HTML (rendered via dangerouslySetInnerHTML) so Webflow runtime JS / IX2 / Swiper /
 * inline SVG attributes all keep working byte-for-byte.
 *
 * Heuristic: walk the body's effective top level. If body has exactly one wrapping
 * <div> that contains many siblings, descend one level (Webflow's body-wrapper pattern).
 * Then group by semantic landmarks (<header>, <footer>, <nav>, <main>) plus
 * <section> elements; everything else collapses into a "Body" component.
 */
export function splitIntoSections(html: string): SplitResult {
  const $ = cheerio.load(html);

  const title = $('head > title').first().text().trim();
  // Capture full <head> inner HTML EXCEPT the <title> (we re-emit it via Next metadata)
  $('head > title').remove();
  const headHtml = ($('head').html() ?? '').trim();

  const $body = $('body');
  const bodyClass = ($body.attr('class') ?? '').trim();
  const bodyAttrs: Record<string, string> = {};
  for (const [k, v] of Object.entries($body.attr() ?? {})) {
    if (k === 'class') continue;
    bodyAttrs[k] = v ?? '';
  }

  // Determine effective root: descend through sole-wrapper divs (max 2 levels) so we
  // get a useful set of siblings to split on (Webflow uses .body-wrapper or similar).
  // Sibling <script> / <noscript> / <style> tags are treated as "transparent" — they
  // don't count toward the wrapper-uniqueness check.
  let $root = $body;
  for (let depth = 0; depth < 2; depth++) {
    const realChildren = $root
      .children()
      .toArray()
      .filter((c) => {
        const t = (c as Element).tagName?.toLowerCase();
        return t !== 'script' && t !== 'noscript' && t !== 'style';
      }) as Element[];
    if (
      realChildren.length === 1 &&
      realChildren[0].tagName?.toLowerCase() === 'div' &&
      $(realChildren[0]).children().length >= 3
    ) {
      $root = $(realChildren[0]);
    } else {
      break;
    }
  }

  const topLevel = $root.children().toArray().filter((el) => {
    const t = (el as Element).tagName?.toLowerCase();
    return t !== 'script' && t !== 'noscript' && t !== 'style';
  }) as Element[];

  // Collect body-level <script>/<noscript>/<style> tags so we can re-emit them at
  // the end of <body> in the layout. We pull them from the ORIGINAL <body>, not
  // $root, since they always live as direct children of <body> regardless of any
  // wrapper div.
  const bodyScriptsHtml = $body
    .children()
    .toArray()
    .filter((el) => {
      const t = (el as Element).tagName?.toLowerCase();
      return t === 'script' || t === 'noscript' || t === 'style';
    })
    .map((el) => $.html(el as Element))
    .join('\n');

  // Iteratively expand "wrapper" divs (divs that contain section-like descendants
  // but are not section-like themselves) so we end up splitting at real semantic
  // boundaries instead of stopping at .body-wrapper / .body-content.
  let frontier: Element[] = topLevel;
  for (let pass = 0; pass < 4; pass++) {
    let expanded = false;
    const next: Element[] = [];
    for (const el of frontier) {
      const tag = el.tagName?.toLowerCase();
      if (isSectionLike(el) || tag !== 'div') {
        next.push(el);
        continue;
      }
      const $el = $(el);
      const sectionDescendantCount = $el
        .find(
          'header, footer, nav, main, section, aside, [class*="hero"], [class*="navbar"], [class*="footer"], [class*="section"], [class*="banner"], [class*="cta"]'
        )
        .length;
      if (sectionDescendantCount >= 2 && $el.children().length >= 2) {
        const inner = $el.children().toArray().filter((c) => {
          const t = (c as Element).tagName?.toLowerCase();
          return t !== 'script' && t !== 'noscript' && t !== 'style';
        }) as Element[];
        next.push(...inner);
        expanded = true;
      } else {
        next.push(el);
      }
    }
    frontier = next;
    if (!expanded) break;
  }

  const sections: Section[] = [];
  const used = new Set<string>();

  // Group consecutive non-landmark, non-section nodes into a single "Body" component
  // so we don't end up with 30 tiny <div> sections.
  let buffer: Element[] = [];
  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const html = buffer.map((el) => $.html(el)).join('\n');
    const name = uniquify('Content', used);
    sections.push({ name, fileName: pascalToKebab(name), html });
    buffer = [];
  };

  frontier.forEach((el, idx) => {
    if (isSectionLike(el)) {
      flushBuffer();
      const name = deriveSectionName(el, idx, used);
      sections.push({
        name,
        fileName: pascalToKebab(name),
        html: $.html(el),
      });
    } else {
      buffer.push(el);
    }
  });
  flushBuffer();

  // Edge case: nothing landmark-like at all → wrap whole body content in a single Page section
  if (sections.length === 0) {
    sections.push({
      name: 'Page',
      fileName: 'page-content',
      html: $root.html() ?? '',
    });
  }

  return { sections, headHtml, title, bodyClass, bodyAttrs, bodyScriptsHtml };
}
