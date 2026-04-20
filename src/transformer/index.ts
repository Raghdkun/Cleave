import type { TransformOptions, AssetRecord } from '../types.js';
import { clean } from './cleaner.js';
import { fix } from './form-fixer.js';
import { injectPackages, getDetectedPackageNames } from './package-injector.js';

export function transform(html: string, options: TransformOptions = {}): string {
  // Step 1: Clean platform bloat
  let result = clean(html);

  // Step 2: Fix forms
  result = fix(result, options.webhookUrl);

  // Step 3: Inject CDN tags for detected animation/UI libraries (when assets provided)
  if (options.assets) {
    result = injectPackages(result, options.assets);
  }

  return result;
}

/** Detect known packages without modifying HTML. */
export function detectPackages(html: string, assets: Map<string, AssetRecord>): string[] {
  return getDetectedPackageNames(html, assets);
}

// Re-export individual modules for direct use
export { clean } from './cleaner.js';
export { fix } from './form-fixer.js';
export { injectPackages } from './package-injector.js';
