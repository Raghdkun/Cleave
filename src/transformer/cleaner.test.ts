import { describe, expect, it } from 'vitest';
import { clean } from './cleaner.js';

describe('clean', () => {
  it('preserves Webflow runtime markers and scripts', () => {
    const html = `
      <html>
        <body data-wf-page="page-1" data-wf-site="site-1">
          <div data-w-id="hero-animation"></div>
          <iframe src="https://117761985.intellimizeio.com/storage.html"></iframe>
          <iframe src="https://webflow.com/dashboard/signup-modal"></iframe>
          <meta http-equiv="Content-Security-Policy-Report-Only" content="default-src 'self'; report-uri https://webflow.report-uri.com/r/t/csp/reportOnly">
          <link href="assets/js/117761985.js" rel="preload" as="script">
          <style id="intellimize-anti-flicker-regions">html[data-intellimize-anti-flicker-rendering]{opacity:0}</style>
          <script src="assets/js/webflow.js"></script>
          <script>(function(e){var s={r:[]};e.wf={r:s.r,ready:t=>{s.r.push(t)}}})(window)</script>
          <script src="assets/js/117761985.js" async=""></script>
          <script id="__NEXT_DATA__" type="application/json">{"assetPrefix":"/assets-marketplace","page":"/made-in-webflow/[...slugs]","props":{"pageProps":{"fallbackData":[{"id":"project-1","title":"Project One"}]}},"scriptLoader":[{"id":"marketing-body","src":"https://webflow.com/resources/marketing-body-v2.js"}]}</script>
          <script src="assets/js/analytics.min.js" data-airgap-id="0"></script>
          <script src="assets/js/webflow-marketing-body-v2.min-95081c3e2d.js"></script>
          <script>
            !function(){var analytics=window.analytics=window.analytics||[];analytics.load=function(key){
              var script=document.createElement("script");
              script.src="https://analytics.webflow.com/analytics.js/v1/abc/analytics.min.js";
              document.head.appendChild(script);
            };analytics.load("abc");}();
          </script>
          <script>
            (function() {
              var gs = document.createElement('script');
              gs.src = 'https://js.partnerstack.com/v1/meh.js';
              document.head.appendChild(gs);
            })();
          </script>
          <script>window.intellimize = { ready() {} };</script>
          <script>wf_utils.getUser(() => {});</script>
          <script>window.Webflow ||= [];</script>
          <div class="w-webflow-badge">badge</div>
        </body>
      </html>
    `;

    const out = clean(html);

    expect(out).toContain('data-w-id="hero-animation"');
    expect(out).toContain('data-wf-page="page-1"');
    expect(out).toContain('data-wf-site="site-1"');
    expect(out).toContain('assets/js/webflow.js');
    expect(out).toContain('window.Webflow');
    expect(out).toContain('data-cleave-analytics-stub');
    expect(out).toContain('__NEXT_DATA__');
    expect(out).toContain('"assetPrefix":"assets-marketplace"');
    expect(out).toContain('data-cleave-marketplace-fallback="true"');
    expect(out).toContain('/api/v1/marketplace/made-in-webflow/feed/');
    expect(out).toContain('/api/feature-config/config/marketplace-client');
    expect(out).toContain("document.getElementById('__NEXT_DATA__')");
    expect(out).toContain('new MutationObserver(rewriteLinks)');
    expect(out).toContain('https://webflow.com');
    expect(out).not.toContain('w-webflow-badge');
    expect(out).not.toContain('intellimizeio.com');
    expect(out).not.toContain('/dashboard/signup-modal');
    expect(out).not.toContain('assets/js/117761985.js');
    expect(out).not.toContain('analytics.min.js');
    expect(out).not.toContain('marketing-body-v2');
    expect(out).not.toContain('analytics.webflow.com/analytics.js');
    expect(out).not.toContain('intellimize-anti-flicker-regions');
    expect(out).not.toContain('Content-Security-Policy-Report-Only');
    expect(out).not.toContain('js.partnerstack.com');
    expect(out).not.toContain('wf_utils.getUser');
    expect(out).not.toContain('e.wf={r:s.r,ready');
  });

  it('preserves Framer runtime mount containers when the runtime is present', () => {
    const html = `
      <html>
        <body>
          <div id="__framer-badge-container"></div>
          <div id="main" data-framer-hydrate-v2="{}"></div>
          <script type="module" src="assets/js/script_main.ABC123.mjs"></script>
        </body>
      </html>
    `;

    const out = clean(html);

    expect(out).toContain('__framer-badge-container');
    expect(out).toContain('data-framer-hydrate-v2');
    expect(out).toContain('script_main.ABC123.mjs');
  });
});