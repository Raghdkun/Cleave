import JSZip from 'jszip';
import type { AssetRecord } from './types.js';
import { logger } from './utils/logger.js';

export async function bundle(
  html: string,
  assets: Map<string, AssetRecord>,
): Promise<Buffer> {
  const zip = new JSZip();

  zip.file('index.html', html);

  for (const [, record] of assets) {
    zip.file(record.localPath, record.content, { binary: true });
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const totalFiles = 1 + assets.size;
  logger.info('ZIP created', {
    files: totalFiles,
    size: `${(zipBuffer.length / 1024).toFixed(1)} KB`,
  });

  return zipBuffer;
}

export async function bundleSite(
  pages: Array<{ localPath: string; html: string }>,
  assets: Map<string, AssetRecord>,
): Promise<Buffer> {
  const zip = new JSZip();

  for (const page of pages) {
    zip.file(page.localPath, page.html);
  }

  for (const [, record] of assets) {
    zip.file(record.localPath, record.content, { binary: true });
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const totalFiles = pages.length + assets.size;
  logger.info('Site ZIP created', {
    pages: pages.length,
    assets: assets.size,
    totalFiles,
    size: `${(zipBuffer.length / 1024).toFixed(1)} KB`,
  });

  return zipBuffer;
}
