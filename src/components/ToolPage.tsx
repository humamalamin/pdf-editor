import PdfEditorApp from "@/components/PdfEditorApp";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { absoluteUrl, siteConfig } from "@/lib/seo";
import { toolPath, type ToolId } from "@/lib/tools";

export default function ToolPage({ toolId, locale }: Readonly<{ toolId: ToolId; locale: Locale }>) {
  const dict = getDictionary(locale);
  const tool = dict.tools[toolId];
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name:
        toolId === "edit"
          ? siteConfig.name
          : `${siteConfig.name} - ${tool.label.includes("PDF") ? tool.label : `${tool.label} PDF`}`,
      url: absoluteUrl(toolPath(toolId, locale)),
      inLanguage: locale,
      description: tool.description,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      browserRequirements: dict.toolPage.browserRequirements,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: locale,
      mainEntity: tool.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <PdfEditorApp tool={toolId} locale={locale} dict={dict} />
      <section className="bg-white px-6 py-12 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <div className="mx-auto max-w-3xl space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {tool.heading}
          </h2>
          <p>{tool.description}</p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {dict.toolPage.howItWorks}
          </h2>
          <ol className="list-decimal space-y-1 pl-5">
            {tool.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {dict.toolPage.faq}
          </h2>
          <dl className="space-y-4">
            {tool.faq.map((item) => (
              <div key={item.question}>
                <dt className="font-medium text-slate-900 dark:text-white">
                  {item.question}
                </dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
