import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { AssetManager, isLikelyAssetUrl } from './asset-manager.js';

describe('isLikelyAssetUrl', () => {
  it('allows Framer runtime chunks served from /sites/', () => {
    expect(
      isLikelyAssetUrl(
        'https://framerusercontent.com/sites/6kfHYbLeAsC8ULu7J1lMln/react.E6GWMTRp.mjs',
      ),
    ).toBe(true);

    expect(
      isLikelyAssetUrl(
        'https://framerusercontent.com/sites/6kfHYbLeAsC8ULu7J1lMln/cGcwyZgAfzhIKzHL0eftT-K3VxJYv9HNrV_7Jku0YA0.CYZIQRYs.mjs',
      ),
    ).toBe(true);
  });

  it('still rejects obvious non-asset URLs', () => {
    expect(isLikelyAssetUrl('https://github.com/Raghdkun/Cleave')).toBe(false);
  });

  it('rejects known telemetry and config endpoints', () => {
    expect(isLikelyAssetUrl('https://analytics-api.webflow.com/v1/p')).toBe(false);
    expect(isLikelyAssetUrl('https://browser-intake-datadoghq.com/api/v2/rum?ddsource=browser')).toBe(false);
    expect(isLikelyAssetUrl('https://api.sprig.com/sdk/1/environments/JiDhkl_tDto7/config')).toBe(false);
    expect(isLikelyAssetUrl('https://js.partnerstack.com/partnerstack.min.js')).toBe(false);
    expect(isLikelyAssetUrl('https://app.birdie.so/manifest.json')).toBe(false);
    expect(isLikelyAssetUrl('https://accounts.google.com/gsi/fedcm/config/passive.js')).toBe(false);
    expect(isLikelyAssetUrl('https://accounts.google.com/gsi/fedcm.js')).toBe(false);
    expect(isLikelyAssetUrl('https://accounts.google.com/gsi/log')).toBe(false);
    expect(isLikelyAssetUrl('https://cdn.dev.website-files.com/66ec3605c8bd3b3330903951/asset_ID_8_weimaraner.jpg')).toBe(false);
    expect(isLikelyAssetUrl('https://s3.amazonaws.com/webflow-dev-assets/66fd83b6cc0c8c6ed0e398e6/content.json')).toBe(false);
    expect(isLikelyAssetUrl('https://s3.amazonaws.com/webflow-prod-assets/6306a56ed8e9b57ef801b758/example.svg')).toBe(false);
  });

  it('rejects Webflow root noise while preserving structured runtime paths', () => {
    expect(isLikelyAssetUrl('https://webflow.com/init.js')).toBe(false);
    expect(isLikelyAssetUrl('https://webflow.com/main.min.js')).toBe(false);
    expect(isLikelyAssetUrl('https://webflow.com/captcha.js')).toBe(false);
    expect(isLikelyAssetUrl('https://webflow.com/1.gif')).toBe(false);
    expect(
      isLikelyAssetUrl('https://d3e54v103j8qbb.cloudfront.net/8088b5a5-758a-405d-b0f7-015c7b573b7f/airgap.js'),
    ).toBe(false);
    expect(
      isLikelyAssetUrl(
        'https://webflow.com/assets-marketplace/_next/static/fonts/Inter-Regular.47e70f6ff0.woff2',
      ),
    ).toBe(false);
    expect(isLikelyAssetUrl('https://webflow.com/TG2vkiqj/init.js')).toBe(true);
  });

  it('preserves structured runtime paths for app bundles', () => {
    const assetManager = new AssetManager();

    expect(
      assetManager.getLocalPath(
        'https://webflow.com/assets-marketplace/_next/static/chunks/pages/made-in-webflow/website/%5Bslug%5D-d488bd85a26422a0.js',
      ),
    ).toBe('assets-marketplace/_next/static/chunks/pages/made-in-webflow/website/[slug]-d488bd85a26422a0.js');

    expect(assetManager.getLocalPath('https://webflow.com/TG2vkiqj/init.js')).toBe('TG2vkiqj/init.js');
  });

  it('rewrites prefetch and inline script references for structured runtime assets', () => {
    const assetManager = new AssetManager();
    const chunkUrl =
      'https://webflow.com/assets-marketplace/_next/static/chunks/pages/made-in-webflow/website/%5Bslug%5D-d488bd85a26422a0.js';
    const initUrl = 'https://webflow.com/TG2vkiqj/init.js';

    (assetManager as unknown as { baseUrl: string }).baseUrl = 'https://webflow.com/made-in-webflow';
    (
      assetManager as unknown as {
        assets: Map<string, { url: string; localPath: string; content: Buffer; mimeType: string }>;
      }
    ).assets.set(chunkUrl, {
      url: chunkUrl,
      localPath: 'assets-marketplace/_next/static/chunks/pages/made-in-webflow/website/[slug]-d488bd85a26422a0.js',
      content: Buffer.alloc(0),
      mimeType: 'application/javascript',
    });
    (
      assetManager as unknown as {
        assets: Map<string, { url: string; localPath: string; content: Buffer; mimeType: string }>;
      }
    ).assets.set(initUrl, {
      url: initUrl,
      localPath: 'TG2vkiqj/init.js',
      content: Buffer.alloc(0),
      mimeType: 'application/javascript',
    });

    const $ = cheerio.load(`
      <link rel="prefetch" href="/assets-marketplace/_next/static/chunks/pages/made-in-webflow/website/%5Bslug%5D-d488bd85a26422a0.js">
      <script>var scriptSrc = '/TG2vkiqj/init.js';</script>
    `);

    assetManager.rewriteHtmlPaths($);

    expect($('link').attr('href')).toBe(
      'assets-marketplace/_next/static/chunks/pages/made-in-webflow/website/%5Bslug%5D-d488bd85a26422a0.js',
    );
    expect($('script').html()).toContain("'TG2vkiqj/init.js'");
  });

  it('rewrites stale CSS font URLs to already-downloaded local assets by filename', async () => {
    const assetManager = new AssetManager();
    const cssUrl =
      'https://webflow.com/assets-marketplace/_next/static/css/e34f45ef8e1e500f.css';

    (
      assetManager as unknown as {
        assets: Map<string, { url: string; localPath: string; content: Buffer; mimeType: string }>;
      }
    ).assets.set(cssUrl, {
      url: cssUrl,
      localPath: 'assets-marketplace/_next/static/css/e34f45ef8e1e500f.css',
      content: Buffer.alloc(0),
      mimeType: 'text/css',
    });
    (
      assetManager as unknown as {
        assets: Map<string, { url: string; localPath: string; content: Buffer; mimeType: string }>;
      }
    ).assets.set('https://fonts.example.com/Inter-SemiBold.8bcb84d706.woff2', {
      url: 'https://fonts.example.com/Inter-SemiBold.8bcb84d706.woff2',
      localPath: 'assets/fonts/Inter-SemiBold.8bcb84d706.woff2',
      content: Buffer.from('font'),
      mimeType: 'font/woff2',
    });

    const css = `@font-face { src: url('../fonts/Inter-SemiBold.8bcb84d706.woff2') format("woff2"); }`;
    const rewritten = await assetManager.processCss(css, cssUrl);

    expect(rewritten).toContain("url('../../../../assets/fonts/Inter-SemiBold.8bcb84d706.woff2')");
  });
});