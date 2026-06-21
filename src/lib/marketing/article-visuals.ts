import { marketingAssets, type MarketingAsset } from "@/lib/marketing/assets";
import type { Article } from "@/lib/marketing/content";

const homeArticleAssets = {
  "meet-pip-cute-money-companion": marketingAssets.blogMeetPipCard,
  "why-your-bank-balance-is-misleading": marketingAssets.blogBankBalanceCard,
  "what-is-spendable-cash-today": marketingAssets.blogSpendableCashCard,
} as const;

export function getArticleVisual(article: Article): MarketingAsset {
  if (article.ogImage) {
    return {
      role: "articleCoverTemplate",
      src: article.ogImage,
      width: 1672,
      height: 941,
      alt: `${article.title} article cover.`,
      decorative: false,
      priority: false,
      placement: `Generated cover for ${article.slug}.`,
    };
  }

  return homeArticleAssets[article.slug as keyof typeof homeArticleAssets] ?? marketingAssets.articleCoverTemplate;
}
