export type ToolId =
  | "edit"
  | "organize"
  | "compress"
  | "merge"
  | "split"
  | "pdf-to-image"
  | "image-to-pdf"
  | "watermark"
  | "protect";

export type ToolFaq = { question: string; answer: string };

export type ToolConfig = {
  id: ToolId;
  label: string;
  path: string;
  title: string;
  heading: string;
  description: string;
  steps: string[];
  faq: ToolFaq[];
};

const privacyFaq: ToolFaq = {
  question: "Are my PDF files uploaded to a server?",
  answer:
    "No. All processing happens locally in your browser, so your documents never leave your device.",
};

export const tools: Record<ToolId, ToolConfig> = {
  edit: {
    id: "edit",
    label: "Edit",
    path: "/",
    title: "PDFEditor - Private Browser-Based PDF Editor",
    heading: "Edit PDF Online, Privately in Your Browser",
    description:
      "Edit, annotate, sign, organize, compress, merge, and split PDF files securely in your browser without uploading documents to a server.",
    steps: [
      "Open a PDF from your device.",
      "Add text, images, or a signature and drag them into place.",
      "Download the edited PDF.",
    ],
    faq: [
      privacyFaq,
      {
        question: "Can I add a signature to a PDF?",
        answer:
          "Yes. Upload an image of your signature, place it on any page, and resize it before downloading.",
      },
    ],
  },
  organize: {
    id: "organize",
    label: "Organize",
    path: "/organize-pdf",
    title: "Organize PDF Pages",
    heading: "Organize PDF Pages Online",
    description:
      "Reorder, rotate, and delete PDF pages in your browser. Fast and private, with no upload to any server.",
    steps: [
      "Open a PDF from your device.",
      "Drag pages to reorder them, or rotate and delete pages you do not need.",
      "Download the reorganized PDF.",
    ],
    faq: [
      privacyFaq,
      {
        question: "Can I reorder pages in a PDF?",
        answer: "Yes. Drag and drop page thumbnails to change their order.",
      },
    ],
  },
  compress: {
    id: "compress",
    label: "Compress",
    path: "/compress-pdf",
    title: "Compress PDF Online",
    heading: "Compress PDF Files Online",
    description:
      "Reduce PDF file size right in your browser. Compress documents for email or upload without sending them to a server.",
    steps: [
      "Open a PDF from your device.",
      "Choose a compression level, or set a target file size such as 500 KB.",
      "Download the smaller PDF.",
    ],
    faq: [
      privacyFaq,
      {
        question: "Can I compress a PDF to a specific size?",
        answer:
          "Yes. Choose Target size, enter the maximum size in KB or MB, and the tool finds the best quality that fits under it.",
      },
      {
        question: "Will compression reduce quality?",
        answer:
          "Stronger compression lowers image quality to save more space. Pick a lighter level to keep documents sharp.",
      },
    ],
  },
  merge: {
    id: "merge",
    label: "Merge",
    path: "/merge-pdf",
    title: "Merge PDF Files Online",
    heading: "Merge PDF Files Online",
    description:
      "Combine multiple PDF files into a single document in your browser. Free, fast, and private with no uploads.",
    steps: [
      "Add two or more PDF files.",
      "Arrange them in the order you want.",
      "Download the merged PDF.",
    ],
    faq: [
      privacyFaq,
      {
        question: "How many PDFs can I merge at once?",
        answer:
          "There is no fixed limit. The practical limit depends on your device memory, since everything runs locally.",
      },
    ],
  },
  split: {
    id: "split",
    label: "Split",
    path: "/split-pdf",
    title: "Split PDF Files Online",
    heading: "Split PDF Files Online",
    description:
      "Split a PDF into separate files or extract page ranges in your browser. Private and fast, with no server upload.",
    steps: [
      "Open a PDF from your device.",
      "Select the pages or ranges to extract.",
      "Download the new PDF files.",
    ],
    faq: [
      privacyFaq,
      {
        question: "Can I extract only certain pages?",
        answer: "Yes. Select the page ranges you need and export just those pages.",
      },
    ],
  },
  "pdf-to-image": {
    id: "pdf-to-image",
    label: "PDF to JPG",
    path: "/pdf-to-jpg",
    title: "Convert PDF to JPG or PNG Online",
    heading: "Convert PDF Pages to JPG or PNG Images",
    description:
      "Turn PDF pages into high-quality JPG or PNG images in your browser. Choose the pages and resolution, with no upload to any server.",
    steps: [
      "Open a PDF from your device.",
      "Select the pages, then pick JPG or PNG and a resolution.",
      "Download a single image, or a ZIP file when you convert several pages.",
    ],
    faq: [
      privacyFaq,
      {
        question: "Which resolution should I choose?",
        answer:
          "Medium (150 DPI) is sharp on screens and keeps files small. Choose High (300 DPI) if you plan to print the images.",
      },
      {
        question: "Should I pick JPG or PNG?",
        answer:
          "JPG gives smaller files and suits scanned pages and photos. PNG is lossless, so text and lines stay crisp, but files are larger.",
      },
    ],
  },
  "image-to-pdf": {
    id: "image-to-pdf",
    label: "JPG to PDF",
    path: "/jpg-to-pdf",
    title: "Convert JPG to PDF Online",
    heading: "Convert JPG and PNG Images to PDF",
    description:
      "Combine JPG, PNG, and other images into a single PDF in your browser. Reorder, rotate, and choose the page size, with no upload to any server.",
    steps: [
      "Add one or more images from your device.",
      "Reorder or rotate them, and choose the page size and margin.",
      "Download the PDF, with one image per page.",
    ],
    faq: [
      privacyFaq,
      {
        question: "Can I combine several photos into one PDF?",
        answer: "Yes. Add as many images as you like, arrange them in order, and they become one PDF with a page per image.",
      },
      {
        question: "Will my images lose quality?",
        answer:
          "Upright JPG and PNG files are embedded as they are, without recompression. Other formats and rotated phone photos are converted at high quality.",
      },
    ],
  },
  watermark: {
    id: "watermark",
    label: "Watermark",
    path: "/watermark-pdf",
    title: "Add Watermark to PDF or Image Online",
    heading: "Add a Text Watermark to PDF Files",
    description:
      "Stamp text like COPY or \"For registration purposes only\" on a PDF or photo of your ID. Private and free, with no upload to any server.",
    steps: [
      "Open a PDF, JPG, or PNG from your device.",
      "Type your watermark text and adjust size, opacity, and rotation while watching the preview.",
      "Download the watermarked PDF.",
    ],
    faq: [
      privacyFaq,
      {
        question: "Why add a watermark to a copy of my ID card?",
        answer:
          "A watermark stating the purpose, such as \"For bank account opening only\", makes it much harder for someone to reuse your ID copy for something else.",
      },
      {
        question: "Can a watermark be removed?",
        answer:
          "A regular watermark is PDF text that someone with a PDF editor can delete. Turn on the permanent option to convert pages to images so the watermark is part of the picture.",
      },
    ],
  },
  protect: {
    id: "protect",
    label: "Protect",
    path: "/protect-pdf",
    title: "Lock or Unlock PDF with a Password Online",
    heading: "Add or Remove a PDF Password",
    description:
      "Protect a PDF with a password using AES-256 encryption, or remove the password from a PDF you own. Everything runs in your browser, so your file and password never leave your device.",
    steps: [
      "Open a PDF from your device.",
      "Choose Lock to set a password, or Unlock and enter the current password.",
      "Download the protected or unlocked PDF.",
    ],
    faq: [
      privacyFaq,
      {
        question: "Can you recover a forgotten PDF password?",
        answer:
          "No. The password is never stored or sent anywhere, so a lost password cannot be recovered. Keep it somewhere safe.",
      },
      {
        question: "Can I unlock a PDF without knowing the password?",
        answer:
          "No. You need the correct password. This tool only removes a password you can already provide.",
      },
      {
        question: "What encryption is used?",
        answer: "Locked files use AES-256, the strongest encryption in the PDF standard.",
      },
    ],
  },
};

export const toolList = Object.values(tools);
