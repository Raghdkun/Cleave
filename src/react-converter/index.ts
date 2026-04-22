import { posix } from 'node:path';
import type { AssetRecord } from '../types.js';
import { logger } from '../utils/logger.js';
import { splitIntoSections } from './section-splitter.js';
import {
  packageJson,
  TSCONFIG_JSON,
  NEXT_CONFIG,
  NEXT_ENV_DTS,
  GITIGNORE,
  README_MD,
  layoutTsx,
  pageTsx,
  sectionTsx,
  GLOBALS_CSS,
  type NextProjectMeta,
} from './templates.js';

export interface ReactProjectFile {
  /** POSIX-style path inside the project, e.g. `app/page.tsx`. */
  path: string;
  /** File contents (string for source, Buffer for binary assets). */
  content: string | Buffer;
}

export interface ConvertOptions {
  /** Original source URL (used to derive project name and metadata). */
  sourceUrl: string;
  /** Cleaned HTML produced by the existing transform pipeline. */
  html: string;
  /** Asset map from AssetManager (URL → record with localPath relative to "assets/..."). */
  assets: Map<string, AssetRecord>;
}

/**
 * Rewrites `assets/...` paths in HTML attributes and inline styles to root-absolute
 * `/assets/...` paths so they resolve correctly on every Next.js route. CSS files
 * keep their relative paths (`url(../fonts/x.woff2)`) since their location relative
 * to other assets is preserved under `/public/assets/`.
 *
 * Conservative regex replacement — we only touch literal `assets/` occurrences
 * inside attribute values or `url(...)` declarations.
 */
function rewriteHtmlAssetPaths(html: string): string {
  let out = html;
  // src="assets/..." | href="assets/..." | data-src="assets/..." | poster="assets/..." etc.
  out = out.replace(
    /((?:src|href|data-src|data-srcset|srcset|poster|action|content|formaction)\s*=\s*["'])(assets\/)/gi,
    '$1/$2',
  );
  // srcset can contain multiple comma-separated `assets/x 1x, assets/y 2x` — handle each token.
  out = out.replace(/(srcset\s*=\s*")([^"]+)(")/gi, (_m, pre, value, post) =>
    pre + value.replace(/(^|,\s*)assets\//g, '$1/assets/') + post,
  );
  // Inline style url(assets/...) — only the bare-relative form, not http(s):// or /assets/ or data:
  out = out.replace(/url\(\s*(["']?)assets\//gi, 'url($1/assets/');
  return out;
}

/**
 * Converts a Cleave-cleaned HTML page + asset map into a fully-formed Next.js
 * (App Router, TypeScript, static-export) project. Returns the list of files to
 * be written into the React ZIP.
 *
 * The conversion is FIDELITY-FIRST: each section component renders the original
 * HTML via `dangerouslySetInnerHTML`, so any Webflow runtime JS (IX2, Swiper,
 * forms, commerce) keeps working byte-for-byte. Real per-component JSX can be
 * introduced incrementally by hand-editing individual section files.
 */
export function convertToReact(opts: ConvertOptions): ReactProjectFile[] {
  const hostname = (() => {
    try {
      return new URL(opts.sourceUrl).hostname || 'cleave-site';
    } catch {
      return 'cleave-site';
    }
  })();

  const split = splitIntoSections(rewriteHtmlAssetPaths(opts.html));

  const meta: NextProjectMeta = {
    hostname,
    title: split.title,
    bodyClass: split.bodyClass,
    bodyAttrs: split.bodyAttrs,
    headHtml: rewriteHtmlAssetPaths(split.headHtml),
    bodyScriptsHtml: rewriteHtmlAssetPaths(split.bodyScriptsHtml),
    sections: split.sections.map((s) => ({ name: s.name, fileName: s.fileName })),
  };

  const files: ReactProjectFile[] = [];

  // Project metadata
  files.push({ path: 'package.json', content: packageJson(meta) });
  files.push({ path: 'tsconfig.json', content: TSCONFIG_JSON });
  files.push({ path: 'next.config.js', content: NEXT_CONFIG });
  files.push({ path: 'next-env.d.ts', content: NEXT_ENV_DTS });
  files.push({ path: '.gitignore', content: GITIGNORE });
  files.push({ path: 'README.md', content: README_MD(meta) });

  // App Router
  files.push({ path: 'app/layout.tsx', content: layoutTsx(meta) });
  files.push({ path: 'app/page.tsx', content: pageTsx(meta) });
  files.push({ path: 'app/globals.css', content: GLOBALS_CSS });

  // Section components
  for (const section of split.sections) {
    files.push({
      path: `components/${section.fileName}.tsx`,
      content: sectionTsx(section.name, section.html),
    });
  }

  // Public assets — copy every asset under /public preserving its relative layout.
  for (const [, record] of opts.assets) {
    const publicPath = posix.join('public', record.localPath);
    files.push({ path: publicPath, content: record.content });
  }

  logger.info('React conversion complete', {
    sections: split.sections.length,
    assets: opts.assets.size,
    files: files.length,
  });

  return files;
}
