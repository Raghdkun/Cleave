import { describe, expect, it } from 'vitest';
import { normalizeSinglePageLinks } from './link-mapper.js';

describe('normalizeSinglePageLinks', () => {
  it('converts root-relative and relative links to absolute source URLs for single-page exports', () => {
    const html = `
      <html>
        <body>
          <a href="/enterprise/contact-sales">Sales</a>
          <a href="feature/aeo">AEO</a>
          <a href="/#main">Jump</a>
          <a href="#footer">Footer</a>
        </body>
      </html>
    `;

    const out = normalizeSinglePageLinks(html, 'https://webflow.com/');

    expect(out).toContain('href="https://webflow.com/enterprise/contact-sales"');
    expect(out).toContain('href="https://webflow.com/feature/aeo"');
    expect(out).toContain('href="#main"');
    expect(out).toContain('href="#footer"');
  });
});