import type { Metadata } from "next";
import ToolPage from "@/components/ToolPage";
import { absoluteUrl } from "@/lib/seo";
import { tools } from "@/lib/tools";

export const metadata: Metadata = {
  title: { absolute: tools.edit.title },
  description: tools.edit.description,
  alternates: { canonical: absoluteUrl("/") },
};

export default function Home() {
  return <ToolPage toolId="edit" />;
}
