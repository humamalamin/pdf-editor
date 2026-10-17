import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ToolPage from "@/components/ToolPage";
import { toolMetadata } from "@/lib/seo";
import { toolBySlug, toolIds, toolSlug } from "@/lib/tools";

const LOCALE = "id";

export const dynamicParams = false;

export function generateStaticParams() {
  return toolIds.filter((id) => id !== "edit").map((id) => ({ tool: toolSlug(id, LOCALE) }));
}

export async function generateMetadata({ params }: PageProps<"/id/[tool]">): Promise<Metadata> {
  const toolId = toolBySlug((await params).tool, LOCALE);
  return toolId ? toolMetadata(toolId, LOCALE) : {};
}

export default async function Page({ params }: PageProps<"/id/[tool]">) {
  const toolId = toolBySlug((await params).tool, LOCALE);
  if (!toolId) notFound();
  return <ToolPage toolId={toolId} locale={LOCALE} />;
}
