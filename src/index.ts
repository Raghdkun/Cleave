import { writeFile } from 'node:fs/promises';
import { Crawler } from './crawler.js';
import { AssetManager } from './asset-manager.js';
import { transform } from './transformer/index.js';
import { bundle, bundleSite } from './bundler.js';
import { SiteCrawler } from './site-crawler.js';
import { remapLinks } from './link-mapper.js';
import { isSafeUrl } from './utils/url-validator.js';
import { logger } from './utils/logger.js';
import type { MultiPageExportOptions, AssetRecord } from './types.js';

function parseArgs(): MultiPageExportOptions {
  const args = process.argv.slice(2);
  let url = '';
  let output = 'export.zip';
  let webhookUrl: string | undefined;
  let maxDepth = 0;
  let concurrency = 3;
  let maxPages = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      output = args[++i];
    } else if (args[i] === '--webhook' || args[i] === '-w') {
      webhookUrl = args[++i];
    } else if (args[i] === '--depth' || args[i] === '-d') {
      maxDepth = parseInt(args[++i], 10);
    } else if (args[i] === '--concurrency' || args[i] === '-c') {
      concurrency = parseInt(args[++i], 10);
    } else if (args[i] === '--max-pages' || args[i] === '-m') {
      maxPages = parseInt(args[++i], 10);
    } else if (!args[i].startsWith('-')) {
      url = args[i];
    }
  }

  if (!url) {
    console.error('Usage: website-exporter <url> [--output/-o <file>] [--webhook/-w <url>] [--depth/-d <n>] [--concurrency/-c <n>] [--max-pages/-m <n>]');
    process.exit(1);
  }

  return { url, output, webhookUrl, maxDepth, concurrency, maxPages };
}

async function exportSinglePage(options: MultiPageExportOptions): Promise<void> {
  // Step 2: Crawl
  logger.info('Step 1/4: Crawling page...');
  const crawler = new Crawler();
  const { html, baseUrl } = await crawler.crawl(options.url);
  logger.info('Crawl complete', { baseUrl, htmlLength: html.length });

  // Step 3: Download & rewrite assets
  logger.info('Step 2/4: Downloading assets...');
  const assetManager = new AssetManager();
  const processed = await assetManager.processPage(html, baseUrl);
  logger.info('Assets processed', { assetCount: processed.assets.size });

  // Step 4: Transform (clean + fix forms)
  logger.info('Step 3/4: Cleaning HTML...');
  const cleanHtml = transform(processed.html, {
    webhookUrl: options.webhookUrl,
  });

  // Step 5: Bundle into ZIP
  logger.info('Step 4/4: Bundling ZIP...');
  const zipBuffer = await bundle(cleanHtml, processed.assets);

  // Step 6: Write to disk
  const outputPath = options.output ?? 'export.zip';
  await writeFile(outputPath, zipBuffer);
  logger.info(`Export complete! Saved to ${outputPath}`, {
    size: `${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`,
    assets: processed.assets.size,
  });
}

async function exportMultiPage(options: MultiPageExportOptions): Promise<void> {
  const maxDepth = options.maxDepth ?? 1;
  const concurrency = options.concurrency ?? 3;
  const maxPages = options.maxPages ?? 50;

  // Step 1: Crawl all pages
  logger.info(`Step 1/5: Crawling site (depth=${maxDepth}, concurrency=${concurrency}, maxPages=${maxPages})...`);
  const siteCrawler = new SiteCrawler({
    maxDepth,
    concurrencyLimit: concurrency,
    sameDomainOnly: true,
    maxPages,
    onProgress: (progress) => {
      logger.info(`Progress: ${progress.processed}/${progress.discovered} pages processed`);
    },
  });

  const { pages, pageMap } = await siteCrawler.crawlSite(options.url);
  logger.info(`Crawl complete: ${pages.length} pages discovered`);

  if (pages.length === 0) {
    logger.error('No pages were crawled successfully');
    process.exit(1);
  }

  // Step 2: Download and rewrite assets for all pages
  logger.info('Step 2/5: Downloading assets...');
  const assetManager = new AssetManager();
  const processedPages: Array<{ localPath: string; html: string; baseUrl: string }> = [];
  let sharedAssets = new Map<string, AssetRecord>();

  for (const page of pages) {
    const processed = await assetManager.processPage(page.html, page.baseUrl, page.localPath);
    processedPages.push({ localPath: page.localPath, html: processed.html, baseUrl: page.baseUrl });
    sharedAssets = processed.assets;
  }

  logger.info('Assets processed', { totalAssets: sharedAssets.size, pages: processedPages.length });

  // Step 3: Transform HTML (clean builder artifacts + fix forms)
  logger.info('Step 3/5: Cleaning HTML...');
  for (const page of processedPages) {
    page.html = transform(page.html, { webhookUrl: options.webhookUrl });
  }

  // Step 4: Remap internal links to relative paths
  logger.info('Step 4/5: Remapping links...');
  for (const page of processedPages) {
    page.html = remapLinks(page.html, page.localPath, pageMap, page.baseUrl);
  }

  // Step 5: Bundle into ZIP
  logger.info('Step 5/5: Bundling ZIP...');
  const zipBuffer = await bundleSite(processedPages, sharedAssets);

  // Write to disk
  const outputPath = options.output ?? 'export.zip';
  await writeFile(outputPath, zipBuffer);
  logger.info(`Multi-page export complete! Saved to ${outputPath}`, {
    pages: processedPages.length,
    assets: sharedAssets.size,
    size: `${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`,
  });
}

async function main(): Promise<void> {
  const options = parseArgs();

  logger.info('Starting website export', { url: options.url });

  // Step 1: Validate URL
  const safe = await isSafeUrl(options.url);
  if (!safe) {
    logger.error('URL failed safety validation', { url: options.url });
    process.exit(1);
  }

  const maxDepth = options.maxDepth ?? 0;

  if (maxDepth > 0) {
    await exportMultiPage(options);
  } else {
    await exportSinglePage(options);
  }
}

main().catch((error: unknown) => {
  logger.error('Export failed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
