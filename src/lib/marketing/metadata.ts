import type { Metadata } from "next";
import { marketingAssets } from "@/lib/marketing/assets";
import { getCanonicalUrl, marketingSite } from "@/lib/marketing/site";

export type MarketingMetadataInput = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
};

export function buildMarketingMetadata(input: MarketingMetadataInput): Metadata {
  const canonical = getCanonicalUrl(input.path);
  const title = input.title === marketingSite.name ? marketingSite.defaultTitle : `${input.title} | Pip`;
  const image = input.image ?? marketingAssets.ogImage.src;

  return {
    title: {
      absolute: title,
    },
    description: input.description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description: input.description,
      url: canonical,
      siteName: marketingSite.name,
      type: input.type ?? "website",
      images: [
        {
          url: image,
          alt: "Pip product preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: input.description,
      images: [image],
    },
  };
}
