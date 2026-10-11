// Keeps public/pdf.worker.min.mjs in sync with the installed pdfjs-dist,
// so the worker and the library can never be on different versions.
import { copyFileSync } from "node:fs";

copyFileSync(
  new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
  new URL("../public/pdf.worker.min.mjs", import.meta.url),
);

// qpdf's WASM binary is fetched at runtime by the Protect PDF tool.
copyFileSync(
  new URL("../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm", import.meta.url),
  new URL("../public/qpdf.wasm", import.meta.url),
);
