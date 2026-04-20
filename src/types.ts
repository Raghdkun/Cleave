export interface CrawlResult {
  html: string;
  baseUrl: string;
}

export interface AssetRecord {
  url: string;
  localPath: string;
  content: Buffer;
  mimeType: string;
}

export interface ProcessedPage {
  html: string;
  assets: Map<string, AssetRecord>;
}

export interface TransformOptions {
  webhookUrl?: string;
}

export interface ExportOptions {
  url: string;
  output?: string;
  webhookUrl?: string;
}

/** Result for a single crawled page in multi-page mode */
export interface PageResult {
  /** The original URL of the page */
  url: string;
  /** The fully rendered HTML content */
  html: string;
  /** The resolved base URL (after redirects) */
  baseUrl: string;
  /** The local file path for this page in the ZIP (e.g., "about/index.html") */
  localPath: string;
}

/** Progress status reported during multi-page crawling */
export interface CrawlProgress {
  /** Total number of unique URLs discovered so far */
  discovered: number;
  /** Number of pages fully processed (rendered + assets downloaded) */
  processed: number;
  /** Number of asset downloads still pending */
  assetsRemaining: number;
}

/** Callback function for progress reporting */
export type ProgressCallback = (status: CrawlProgress) => void;

/** Configuration for the BFS site crawler */
export interface SiteCrawlConfig {
  /** Maximum depth of BFS traversal (0 = start page only) */
  maxDepth: number;
  /** Maximum number of pages to crawl concurrently */
  concurrencyLimit: number;
  /** Only crawl URLs on the same root domain */
  sameDomainOnly: boolean;
  /** Maximum total pages to crawl (0 = unlimited) */
  maxPages: number;
  /** Optional progress callback */
  onProgress?: ProgressCallback;
}

/** Extended export options supporting multi-page mode */
export interface MultiPageExportOptions extends ExportOptions {
  /** BFS crawl depth (0 = single page, default) */
  maxDepth?: number;
  /** Page crawl concurrency (default: 3) */
  concurrency?: number;
  /** Maximum total pages to crawl (default: 50, 0 = unlimited) */
  maxPages?: number;
}
