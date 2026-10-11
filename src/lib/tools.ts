export type ToolId = "edit" | "organize" | "compress" | "merge" | "split";

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
};

export const toolList = Object.values(tools);
