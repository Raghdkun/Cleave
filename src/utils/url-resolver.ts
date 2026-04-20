const NON_DOWNLOADABLE_SCHEMES = ['data:', 'blob:', 'javascript:', 'mailto:', 'tel:'];

export function resolveUrl(href: string, base: string): string {
  if (!href || href.startsWith('#') || href.startsWith('?')) {
    return href;
  }

  for (const scheme of NON_DOWNLOADABLE_SCHEMES) {
    if (href.startsWith(scheme)) {
      return href;
    }
  }

  try {
    const input = href.startsWith('//') ? `https:${href}` : href;
    const resolved = new URL(input, base);
    resolved.hash = '';
    return resolved.href;
  } catch {
    return href;
  }
}
