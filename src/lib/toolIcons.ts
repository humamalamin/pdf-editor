import {
  Combine,
  FileImage,
  FileType,
  Hash,
  Images,
  Layout,
  Lock,
  Minimize2,
  PenTool,
  Scissors,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import type { ToolCategory, ToolId } from "@/lib/tools";

export const toolIcons: Record<ToolId, LucideIcon> = {
  edit: PenTool,
  organize: Layout,
  compress: Minimize2,
  merge: Combine,
  split: Scissors,
  "pdf-to-image": FileImage,
  "image-to-pdf": Images,
  "pdf-to-word": FileType,
  "page-numbers": Hash,
  watermark: Stamp,
  protect: Lock,
};

/** Icon tile colour per category, as in the design: yellow, blue tint, outlined, ink. */
export const categoryIconClass: Record<ToolCategory, string> = {
  edit: "bg-marker text-[#15171C]",
  pages: "bg-tint-blue text-ink",
  convert: "border border-line bg-surface text-ink",
  secure: "bg-ink text-paper",
};
