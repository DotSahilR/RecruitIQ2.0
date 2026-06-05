const fs = require("fs");
const path = require("path");
const { createCanvas } = require("@napi-rs/canvas");
const { createWorker } = require("tesseract.js");

// Render scale for PDF → image conversion. 2.0 gives ~150dpi which is a sweet spot
// for OCR accuracy vs. speed. Higher = more accurate, slower, more memory.
const RENDER_SCALE = 2.0;

// Hard cap on pages we'll OCR per resume. Most résumés are 1–3 pages.
// Prevents a 50-page PDF from hanging a worker for minutes.
const MAX_PAGES = 6;

// pdfjs-dist v6 is ESM-only. Load it lazily once and reuse.
// In Node we point workerSrc at the bundled worker file so getDocument doesn't
// throw "Invalid `workerSrc` type" — pdfjs still runs the worker in-process via
// the Node-compatible fake worker shim.
let pdfjsLibPromise = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const { pathToFileURL } = require("url");
      const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
      mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
      return mod;
    })();
  }
  return pdfjsLibPromise;
}

// Tesseract worker singleton. Loading the English model takes ~2s on first call;
// reusing the worker across pages and jobs avoids paying that cost repeatedly.
let tesseractWorker = null;
let tesseractMutex = Promise.resolve();
async function getTesseractWorker() {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker("eng");
  }
  return tesseractWorker;
}

/**
 * Render a single PDF page to a PNG buffer using @napi-rs/canvas.
 */
async function renderPageToPng(page) {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  // pdfjs expects a CanvasRenderingContext2D and a viewport.
  // @napi-rs/canvas's context is API-compatible for pdfjs's needs.
  await page.render({
    canvasContext: context,
    viewport,
    canvas, // pdfjs v6 wants the canvas element too
  }).promise;

  return canvas.toBuffer("image/png");
}

/**
 * Run OCR on a scanned/image PDF.
 * Reads file → rasterizes each page → tesseract.recognize → concatenated text.
 */
async function runOcrOnPdf(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`OCR source file not found: ${filePath}`);
  }

  console.log(`[ocr] runOcrOnPdf start file=${path.basename(filePath)}`);
  const t0 = Date.now();
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(await fs.promises.readFile(filePath));
  const loadingTask = pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;

  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  console.log(`[ocr] runOcrOnPdf loaded pages=${pdf.numPages} (processing ${pageCount})`);
  const worker = await getTesseractWorker();
  const pageTexts = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const pngBuffer = await renderPageToPng(page);

    // Serialize tesseract calls — one worker can't recognize() in parallel.
    const text = await (tesseractMutex = tesseractMutex.then(async () => {
      const { data: result } = await worker.recognize(pngBuffer);
      return result.text || "";
    }));

    pageTexts.push(text.trim());
    console.log(`[ocr]   page ${pageNum}/${pageCount} chars=${text.length}`);
    page.cleanup();
  }

  await pdf.cleanup();
  const fullText = pageTexts.join("\n\n").trim();
  console.log(`[ocr] runOcrOnPdf done file=${path.basename(filePath)} pages=${pageCount} total_chars=${fullText.length} elapsed=${Date.now() - t0}ms`);
  return fullText;
}

/**
 * Graceful shutdown — terminate the tesseract worker if it was created.
 */
async function shutdownOcr() {
  if (tesseractWorker) {
    try {
      await tesseractWorker.terminate();
    } catch (_) {
      // ignore
    }
    tesseractWorker = null;
  }
}

module.exports = {
  runOcrOnPdf,
  shutdownOcr,
  RENDER_SCALE,
  MAX_PAGES,
};
