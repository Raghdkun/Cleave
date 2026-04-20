import type { TransformOptions } from '../types.js';
import { clean } from './cleaner.js';
import { fix } from './form-fixer.js';

export function transform(html: string, options: TransformOptions = {}): string {
  // Step 1: Clean platform bloat
  let result = clean(html);

  // Step 2: Fix forms
  result = fix(result, options.webhookUrl);

  return result;
}

// Re-export individual modules for direct use
export { clean } from './cleaner.js';
export { fix } from './form-fixer.js';
