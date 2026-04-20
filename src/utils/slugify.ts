import { posix } from 'node:path';

const KNOWN_EXTENSIONS = new Set(['.html', '.htm', '.php', '.asp', '.aspx', '.jsp', '.pdf', '.xml']);

export function slugifyPath(urlPath: string): string {
  // Strip query parameters and hash fragments
  let path = urlPath.split('?')[0].split('#')[0];

  // Decode URI components
  try {
    path = decodeURIComponent(path);
  } catch {
    // If decoding fails, use the original path
  }

  // Strip leading slash to make relative
  path = path.replace(/^\/+/, '');

  // Sanitize: replace disallowed chars with -
  path = path.replace(/[^a-zA-Z0-9._\-/]/g, '-');

  // Collapse multiple slashes into one
  path = path.replace(/\/{2,}/g, '/');

  // Collapse multiple dashes into one
  path = path.replace(/-{2,}/g, '-');

  // Remove leading/trailing dashes from each segment and filter traversal
  path = path
    .split('/')
    .map((seg) => seg.replace(/^-+|-+$/g, ''))
    .filter((seg) => seg.length > 0 && seg !== '..' && seg !== '.')
    .join('/');

  // Empty path → index.html
  if (!path) {
    return 'index.html';
  }

  // Check if the last segment has a known extension
  const lastSegment = path.split('/').pop()!;
  const extIndex = lastSegment.lastIndexOf('.');
  if (extIndex !== -1) {
    const ext = lastSegment.slice(extIndex).toLowerCase();
    if (KNOWN_EXTENSIONS.has(ext)) {
      return path;
    }
  }

  // If the last segment has any extension (e.g. .pdf, .css, .js, .png), preserve it
  if (extIndex !== -1) {
    return path;
  }

  // No extension → folder-with-index.html pattern
  return `${path}/index.html`;
}

export function getRelativePath(fromFile: string, toFile: string): string {
  const fromDir = posix.dirname(fromFile);
  const rel = posix.relative(fromDir, toFile);
  return rel || toFile;
}
