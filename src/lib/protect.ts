import { encryptPDF } from "@pdfsmaller/pdf-encrypt";
import { pdfjsLib } from "@/lib/pdfjs";

export type PdfStatus = "open" | "password" | "invalid";

export type LockOptions = {
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
};

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong password");
  }
}

export class AlreadyProtectedError extends Error {
  constructor() {
    super("PDF is already password-protected");
  }
}

const QPDF_WASM_URL = "/qpdf.wasm";

// The package typings omit writeFile and the print hooks, so describe what we use.
type QpdfInstance = {
  callMain: (args: string[]) => number;
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
  };
};
type CreateQpdf = (options: {
  locateFile: () => string;
  noInitialRun: boolean;
  print: (line: string) => void;
  printErr: (line: string) => void;
}) => Promise<QpdfInstance>;

/** Tells whether a PDF opens freely, needs a password, or cannot be read. */
export async function getPdfStatus(buffer: ArrayBuffer): Promise<PdfStatus> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
    await pdf.destroy();
    return "open";
  } catch (err) {
    return err instanceof Error && err.name === "PasswordException" ? "password" : "invalid";
  }
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function lockPdf(
  buffer: ArrayBuffer,
  password: string,
  { allowPrinting, allowCopying, allowModifying }: LockOptions,
): Promise<Uint8Array> {
  if ((await getPdfStatus(buffer)) === "password") throw new AlreadyProtectedError();

  // Restrictions only hold if the opener does not also hold the owner password,
  // so use a throwaway owner password whenever any permission is withheld.
  const restricted = !allowPrinting || !allowCopying || !allowModifying;
  return encryptPDF(new Uint8Array(buffer), password, {
    algorithm: "AES-256",
    ownerPassword: restricted ? randomSecret() : password,
    allowPrinting,
    allowHighQualityPrint: allowPrinting,
    allowCopying,
    allowExtraction: allowCopying,
    allowModifying,
    allowAnnotating: allowModifying,
    allowAssembly: allowModifying,
  });
}

export async function unlockPdf(buffer: ArrayBuffer, password: string): Promise<Uint8Array> {
  const { default: factory } = await import("@neslinesli93/qpdf-wasm");
  const createQpdf = factory as unknown as CreateQpdf;
  const errors: string[] = [];
  const qpdf = await createQpdf({
    locateFile: () => QPDF_WASM_URL,
    noInitialRun: true,
    print: () => {},
    printErr: (line: string) => errors.push(line),
  });

  qpdf.FS.writeFile("/input.pdf", new Uint8Array(buffer));
  let code: number;
  try {
    code = qpdf.callMain([`--password=${password}`, "--decrypt", "/input.pdf", "/output.pdf"]);
  } catch {
    code = 2;
  }

  if (code !== 0 && code !== 3) {
    if (errors.some((line) => /invalid password/i.test(line))) throw new WrongPasswordError();
    throw new Error("Failed to unlock PDF");
  }
  return qpdf.FS.readFile("/output.pdf");
}
