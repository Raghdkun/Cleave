# Website Exporter

A Node.js/TypeScript CLI tool that exports a fully rendered website into a portable, clean HTML ZIP package. It uses Playwright to crawl pages with full JavaScript rendering, downloads all referenced assets (images, CSS, JS, fonts, media), strips platform bloat and analytics trackers, rewrites paths for offline use, and bundles everything into a compressed ZIP file.

## Features

- **Playwright-based headless crawling** with full JavaScript rendering
- **Multi-page support** — BFS crawl with configurable depth, concurrency, and page limits
- **Recursive asset downloading** — images, CSS, JS, fonts, media, and more
- **CSS deep scanning** — `url()` references and `@import` recursion (up to 10 levels)
- **Inline `<style>` processing** — downloads fonts and images referenced in inline CSS
- **Inline `style` attribute processing** — localizes `background-image: url(...)` from HTML attributes
- **`srcset` responsive image support** — parses and rewrites all responsive image sources
- **Path rewriting** — absolute URLs to relative paths for offline portability
- **Asset deduplication** via content-addressed local paths
- **Platform bloat removal** — Webflow, Wix, Framer artifacts cleaned
- **Framer animation fix** — resets `opacity:0` / `transform` animation initial states so content is visible without JS
- **Analytics and tracking script removal**
- **Form action rewriting** with optional webhook forwarding
- **Internal link remapping** — multi-page exports get correct relative links
- **SSRF protection** — private IP and DNS rebinding checks
- **DEFLATE-compressed ZIP output**
- **Fail-soft error handling** — individual asset failures don't abort the export

## Prerequisites

- Node.js 18+
- npm

## Installation

```bash
git clone <repo-url>
cd website-exporter
npm install
npx playwright install chromium
```

## Usage

```bash
# Basic single-page export (outputs export.zip)
npx tsx src/index.ts https://example.com

# Custom output filename
npx tsx src/index.ts https://example.com -o my-site.zip

# With form webhook URL
npx tsx src/index.ts https://example.com -w https://hooks.example.com/submit

# Multi-page crawl (depth 2, up to 20 pages)
npx tsx src/index.ts https://example.com -d 2 -m 20

# Full options
npx tsx src/index.ts https://example.com \
  --output my-site.zip \
  --webhook https://hooks.example.com/submit \
  --depth 2 \
  --concurrency 5 \
  --max-pages 100
```

## CLI Options

| Option | Alias | Description | Default |
|---|---|---|---|
| `<url>` | | Target URL to export (required) | |
| `--output` | `-o` | Output ZIP filename | `export.zip` |
| `--webhook` | `-w` | Webhook URL to replace form actions with | |
| `--depth` | `-d` | BFS crawl depth (`0` = single page only) | `0` |
| `--concurrency` | `-c` | Number of pages to crawl concurrently | `3` |
| `--max-pages` | `-m` | Maximum total pages to crawl | `50` |

## Output Structure

### Single Page (`--depth 0`)

```
export.zip
├── index.html
└── assets/
    ├── css/
    ├── js/
    ├── images/
    ├── fonts/
    ├── media/
    └── other/
```

### Multi-Page (`--depth > 0`)

```
export.zip
├── index.html
├── about/
│   └── index.html
├── blog/
│   ├── index.html
│   └── my-post/
│       └── index.html
└── assets/
    ├── css/
    ├── js/
    ├── images/
    ├── fonts/
    ├── media/
    └── other/
```

Assets are categorized by file extension and content type. Filenames are preserved from the original URLs; duplicates are disambiguated with a numeric suffix. Internal links are remapped to relative paths between pages.

## What Gets Cleaned

### Webflow

- `data-wf-*`, `data-w-id`, `data-wf-domain`, `data-wf-page`, `data-wf-site` attributes
- Scripts with `webflow` in source URL or inline content
- `.w-webflow-badge` elements

### Wix

- `data-mesh-id`, `data-testid`, `data-hook`, `corvid-*` attributes
- `wix-*` custom elements
- Scripts and styles containing `wix` or `_wixCssModules`

### Framer

- Non-essential `data-framer-*` attributes (preserves CSS-critical ones like `data-framer-component-type`)
- Elements with `__framer-` in class or id
- "Made with Framer" badge links
- Resets scroll-animation initial states (`opacity:0` + `transform` offsets → visible)

### Analytics and Tracking

The following trackers are removed from scripts and noscript tags:

| Tracker | Detected Patterns |
|---|---|
| Google Tag Manager | `googletagmanager`, `gtag/js`, `gtag()`, `dataLayer.push` |
| Google Analytics | `google-analytics`, `ga('...)`, `_gaq` |
| Facebook Pixel | `fbevents`, `connect.facebook`, `fbq()` |
| Intercom | `widget.intercom`, `intercomSettings`, `Intercom()` |
| Drift | `js.driftt` |
| Crisp | `client.crisp` |
| Hotjar | `hotjar` |
| Microsoft Clarity | `clarity.ms` |

Tracking noscript pixels from `googletagmanager`, `facebook`, and `doubleclick` domains are also removed.

### Forms

Form actions are preserved in a `data-original-action` attribute. The `action` attribute is replaced with the webhook URL (if provided via `--webhook`) or `#`. Platform-specific form attributes (`data-wf-page-id`, `wf-form`, `data-hook`, `data-node-type`) are removed.

## Architecture

### Single-Page Pipeline

```
URL → Crawler → AssetManager → Transformer → Bundler → ZIP
```

### Multi-Page Pipeline

```
URL → SiteCrawler (BFS) → AssetManager (per page) → Transformer → LinkMapper → Bundler → ZIP
```

| Module | Responsibility |
|---|---|
| **Crawler** (`src/crawler.ts`) | Launches headless Chromium via Playwright, navigates to the target URL, waits for network idle, and extracts the fully rendered HTML and resolved base URL. |
| **SiteCrawler** (`src/site-crawler.ts`) | BFS traversal starting from the root URL. Discovers internal links, crawls pages concurrently up to the configured depth and page limits, and reports progress. |
| **AssetManager** (`src/asset-manager.ts`) | Parses HTML for asset references (`src`, `href`, `srcset`, `poster`), downloads them concurrently, processes CSS files and inline `<style>` blocks for nested `url()` and `@import` references, localizes inline `style` attribute background images, deduplicates assets, and rewrites all paths to local files. |
| **Transformer** (`src/transformer/`) | Runs the cleaner to strip platform-specific bloat, analytics scripts, and fix Framer animation states, then runs the form fixer to rewrite form actions. |
| **LinkMapper** (`src/link-mapper.ts`) | Rewrites internal links in multi-page exports to use correct relative paths between pages. |
| **Bundler** (`src/bundler.ts`) | Packages cleaned HTML and all downloaded assets into a DEFLATE-compressed ZIP file. |

### Supporting Utilities

| Module | Responsibility |
|---|---|
| **URL Validator** (`src/utils/url-validator.ts`) | SSRF protection: blocks private IPs, localhost, `.local` domains, link-local addresses, and non-HTTP(S) schemes. |
| **URL Resolver** (`src/utils/url-resolver.ts`) | Resolves relative URLs against a base URL. |
| **Slugify** (`src/utils/slugify.ts`) | Converts URL paths to safe local file paths for multi-page exports. |
| **Logger** (`src/utils/logger.ts`) | Structured logging with configurable level and timestamped JSON output. |

## Configuration

### Environment Variables

| Variable | Values | Default | Description |
|---|---|---|---|
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` | Controls log output verbosity |

## Web UI

Cleave includes a web interface for exporting websites through a browser.

### Quick Start

```bash
cd web
npm install
npm run dev
```

This starts both the API server (port 3001) and the Vite dev server (port 5173). Open `http://localhost:5173`.

### Production

```bash
cd web
npm run build
npm start
```

Serves the built frontend and API from a single Express server on port 3001.

### Web UI Features

- **Real-time progress** — SSE-based live progress with step-by-step tracking
- **Live log output** — scrolling terminal showing export logs
- **Advanced options** — configurable crawl depth, max pages, concurrency
- **ZIP download** — one-click download when export finishes
- **Cancel support** — abort in-progress exports
- **Job cleanup** — auto-cleanup of expired jobs (30 min TTL)

### API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/export` | Start a new export job. Body: `{ url, depth?, maxPages?, concurrency? }` |
| `GET` | `/api/export/:id/progress` | SSE stream of export progress |
| `GET` | `/api/export/:id/download` | Download the completed ZIP file |
| `DELETE` | `/api/export/:id` | Cancel an in-progress export |
| `GET` | `/api/health` | Health check |

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| Animations | Framer Motion |
| Icons | Lucide React |
| API Server | Express.js |
| Progress | Server-Sent Events (SSE) |

## Limitations

- Maximum 50 MB per individual asset download
- 5 concurrent asset downloads
- Maximum CSS `@import` recursion depth of 10
- Navigation timeout of 30 seconds per page load

## License

MIT
