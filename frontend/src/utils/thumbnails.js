/**
 * Generates a thumbnail (data URL) from the first page of a PDF.
 * Uses pdfjs-dist which is already installed.
 */

import * as pdfjs from 'pdfjs-dist';

// Set worker path — Vite serves it from node_modules
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).href;

const cache = new Map(); // fileId → dataURL

export async function generateThumbnail(fileId, pdfUrl, authHeaders = {}) {
  if (cache.has(fileId)) return cache.get(fileId);

  try {
    const pdf = await pdfjs.getDocument({ url: pdfUrl, httpHeaders: authHeaders }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 0.6 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    cache.set(fileId, dataUrl);
    pdf.destroy();
    return dataUrl;
  } catch {
    return null;
  }
}

export async function generateThumbnailsBatch(files, getStreamUrl, authHeaders, onProgress) {
  const results = {};
  // Generate thumbnails in small batches to avoid memory issues
  const BATCH = 4;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (file) => {
        try {
          const url = getStreamUrl(file.id);
          const thumb = await generateThumbnail(file.id, url, authHeaders);
          if (thumb) results[file.id] = thumb;
        } catch {}
      })
    );
    if (onProgress) onProgress(Math.min(i + BATCH, files.length), files.length);
  }
  return results;
}
