import type { Metadata } from "next";
import ToolPage from "@/components/ToolPage";
import { absoluteUrl } from "@/lib/seo";
import { tools } from "@/lib/tools";

const tool = tools.organize;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  alternates: { canonical: absoluteUrl(tool.path) },
  openGraph: {
    title: tool.title,
    description: tool.description,
    url: absoluteUrl(tool.path),
  },
};

export default function Page() {
  return <ToolPage toolId="organize" />;
}
