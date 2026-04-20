import * as cheerio from 'cheerio';
import type { AssetRecord } from '../types.js';

/**
 * Known packages we can auto-detect and inject as CDN scripts.
 * Each entry includes:
 *  - signatures: regex patterns to detect in JS/HTML (package names, global vars, common API calls)
 *  - cdn: CDN URL to inject
 *  - global: optional check (skip if already loaded)
 *  - module: true if it should be loaded as ES module
 */
interface PackageDef {
  name: string;
  signatures: RegExp[];
  cdn: string;
  module?: boolean;
  defer?: boolean;
}

const PACKAGES: PackageDef[] = [
  {
    name: 'framer-motion',
    signatures: [
      /["']framer-motion["']/,
      /\bframerMotion\b/,
      /framer-motion(@|\/|\.min\.js)/,
    ],
    cdn: 'https://unpkg.com/framer-motion@11/dist/framer-motion.js',
  },
  {
    name: 'gsap',
    signatures: [
      /["']gsap["']/,
      /\bgsap\.(to|from|fromTo|set|timeline|registerPlugin)\s*\(/,
      /from\s*["']gsap/,
    ],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  },
  {
    name: 'gsap/ScrollTrigger',
    signatures: [/ScrollTrigger\.(create|register|refresh)\s*\(/, /["']gsap\/ScrollTrigger["']/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
  },
  {
    name: 'gsap/ScrollSmoother',
    signatures: [/ScrollSmoother\.(create|get)\s*\(/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollSmoother.min.js',
  },
  {
    name: 'aos',
    signatures: [/\bAOS\.init\s*\(/, /\[data-aos[=\]]/, /["']aos["']/],
    cdn: 'https://unpkg.com/aos@2.3.4/dist/aos.js',
  },
  {
    name: 'swiper',
    signatures: [/\bnew\s+Swiper\s*\(/, /\bswiper-(container|wrapper|slide)\b/, /["']swiper["']/],
    cdn: 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js',
  },
  {
    name: 'lottie-web',
    signatures: [/\blottie\.loadAnimation\s*\(/, /["']lottie-web["']/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js',
  },
  {
    name: 'three',
    signatures: [/\bnew\s+THREE\.[A-Z]/, /["']three["']/, /from\s*["']three/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r160/three.min.js',
  },
  {
    name: 'anime.js',
    signatures: [/\banime\s*\(\s*\{/, /\banime\.timeline\s*\(/, /["']animejs["']/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js',
  },
  {
    name: 'locomotive-scroll',
    signatures: [/\bnew\s+LocomotiveScroll\s*\(/, /["']locomotive-scroll["']/, /\bdata-scroll-container\b/],
    cdn: 'https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.js',
  },
  {
    name: 'scrollmagic',
    signatures: [/\bnew\s+ScrollMagic\.Controller\s*\(/, /["']scrollmagic["']/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/ScrollMagic/2.0.8/ScrollMagic.min.js',
  },
  {
    name: 'alpinejs',
    signatures: [/\bx-data\s*=/, /["']alpinejs["']/, /\bAlpine\.(start|data|store)\s*\(/],
    cdn: 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js',
    defer: true,
  },
  {
    name: 'jquery',
    signatures: [/\bjQuery\b/, /\$\(\s*document\s*\)\.ready/, /\bjquery(\.min)?\.js/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
  },
  {
    name: 'tippy.js',
    signatures: [/\btippy\s*\(/, /["']tippy\.js["']/],
    cdn: 'https://unpkg.com/tippy.js@6/dist/tippy-bundle.umd.min.js',
  },
  {
    name: 'chart.js',
    signatures: [/\bnew\s+Chart\s*\(/, /["']chart\.js["']/],
    cdn: 'https://cdn.jsdelivr.net/npm/chart.js@4',
  },
  {
    name: 'typed.js',
    signatures: [/\bnew\s+Typed\s*\(/, /["']typed\.js["']/],
    cdn: 'https://cdn.jsdelivr.net/npm/typed.js@2.1.0',
  },
  {
    name: 'particles.js',
    signatures: [/\bparticlesJS(\.load)?\s*\(/, /["']particles\.js["']/],
    cdn: 'https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js',
  },
  {
    name: 'vanilla-tilt',
    signatures: [/\bVanillaTilt\.init\s*\(/, /\bdata-tilt\b/, /["']vanilla-tilt["']/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.8.1/vanilla-tilt.min.js',
  },
  {
    name: 'splitting',
    signatures: [/\bSplitting\s*\(/, /["']splitting["']/, /\bdata-splitting\b/],
    cdn: 'https://unpkg.com/splitting/dist/splitting.min.js',
  },
  {
    name: 'rellax',
    signatures: [/\bnew\s+Rellax\s*\(/, /["']rellax["']/, /\bdata-rellax-speed\b/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/rellax/1.12.1/rellax.min.js',
  },
  {
    name: 'scrollreveal',
    signatures: [/\bScrollReveal\s*\(/, /["']scrollreveal["']/],
    cdn: 'https://unpkg.com/scrollreveal',
  },
  {
    name: 'barba.js',
    signatures: [/\bbarba\.init\s*\(/, /["']@barba\/core["']/],
    cdn: 'https://cdn.jsdelivr.net/npm/@barba/core',
  },
  {
    name: 'matter-js',
    signatures: [/\bMatter\.(Engine|World|Bodies)\.[a-z]/, /["']matter-js["']/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
  },
  {
    name: 'p5.js',
    signatures: [/\bnew\s+p5\s*\(/, /["']p5["']/],
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js',
  },
];

/**
 * Scans HTML, inline scripts, and external script src URLs for known package signatures.
 *
 * Note: We deliberately do NOT scan downloaded JS bundle contents — modern bundlers
 * (Webpack/Vite/Framer) inline library code, so finding e.g. `AnimatePresence` inside
 * a bundle does NOT mean the page needs a separate framer-motion CDN. Injecting one
 * would duplicate code or conflict with the bundled version.
 *
 * This way we only inject CDNs for libraries that:
 *   - Are referenced via inline scripts (e.g. `gsap.to(...)`, `AOS.init()`)
 *   - Are referenced via attributes (e.g. `data-aos`, `data-tilt`)
 *   - Are referenced by an external script src URL we can identify by name
 */
function detectPackages(html: string, _assets: Map<string, AssetRecord>): PackageDef[] {
  const $ = cheerio.load(html);

  // 1) Raw HTML (catches attributes like data-aos, x-data, data-tilt)
  let scanText = html;

  // 2) Inline <script> contents
  $('script:not([src])').each(function () {
    scanText += '\n' + ($(this).html() ?? '');
  });

  // 3) External <script src> URLs (catches references like gsap.min.js even when not yet downloaded)
  $('script[src]').each(function () {
    scanText += '\n' + ($(this).attr('src') ?? '');
  });

  // 4) <link href> for CSS that ships with these libs (aos.css, swiper-bundle.css, etc.)
  $('link[href]').each(function () {
    scanText += '\n' + ($(this).attr('href') ?? '');
  });

  const detected: PackageDef[] = [];
  for (const pkg of PACKAGES) {
    if (pkg.signatures.some((re) => re.test(scanText))) {
      detected.push(pkg);
    }
  }
  return detected;
}

/**
 * Injects CDN <script> tags for detected animation/UI packages into the HTML.
 * Skips packages that already appear loaded via existing <script src> tags.
 */
export function injectPackages(html: string, assets: Map<string, AssetRecord>): string {
  const detected = detectPackages(html, assets);
  if (detected.length === 0) return html;

  const $ = cheerio.load(html);

  // Collect existing script src URLs to avoid duplicate CDN injection
  const existingSrcs = new Set<string>();
  $('script[src]').each(function () {
    const src = $(this).attr('src') ?? '';
    existingSrcs.add(src.toLowerCase());
  });

  const isAlreadyLoaded = (cdnUrl: string): boolean => {
    const fileName = cdnUrl.split('/').pop()?.toLowerCase() ?? '';
    if (!fileName) return false;
    for (const src of existingSrcs) {
      if (src.includes(fileName.replace(/\.min\.js$/, '').replace(/\.js$/, ''))) {
        return true;
      }
    }
    return false;
  };

  // Build script tags
  const tags: string[] = [];
  tags.push(`<!-- Cleave: auto-injected animation/UI library CDNs -->`);
  for (const pkg of detected) {
    if (isAlreadyLoaded(pkg.cdn)) continue;
    const attrs: string[] = [`src="${pkg.cdn}"`, `crossorigin="anonymous"`];
    if (pkg.module) attrs.push('type="module"');
    if (pkg.defer) attrs.push('defer');
    tags.push(`<script ${attrs.join(' ')} data-cleave-cdn="${pkg.name}"></script>`);
  }
  tags.push(`<!-- /Cleave -->`);

  if (tags.length <= 2) return html; // nothing new to inject

  const head = $('head');
  if (head.length === 0) {
    // If no head, prepend before first script in body
    $('body').prepend(tags.join('\n'));
  } else {
    head.prepend(tags.join('\n'));
  }

  return $.html();
}

/** Exported for testing/inspection */
export function getDetectedPackageNames(html: string, assets: Map<string, AssetRecord>): string[] {
  return detectPackages(html, assets).map((p) => p.name);
}
