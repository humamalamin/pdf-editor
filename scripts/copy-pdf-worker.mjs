// Keeps public/pdf.worker.min.mjs in sync with the installed pdfjs-dist version.
// Runs on postinstall so the worker can never drift out of sync with the API,
// which triggers "The API version X does not match the Worker version Y".
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const src = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const dest = resolve(root, "public", "pdf.worker.min.mjs");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);

console.log(`[copy-pdf-worker] Copied worker -> public/pdf.worker.min.mjs`);
