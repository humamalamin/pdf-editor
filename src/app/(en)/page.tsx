import type { Metadata } from "next";
import ToolPage from "@/components/ToolPage";
import { toolMetadata } from "@/lib/seo";

export const metadata: Metadata = toolMetadata("edit", "en");

export default function Home() {
  return <ToolPage toolId="edit" locale="en" />;
}
