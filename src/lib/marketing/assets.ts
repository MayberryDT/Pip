export type MarketingAssetRole =
  | "homepageHeroProduct"
  | "bankBalanceComparison"
  | "cuteSeriousCharacter"
  | "pipEmotionalStates"
  | "pricingIllustration"
  | "securityTrustIllustration"
  | "howPipWorksSteps"
  | "founderInsight"
  | "ogImage"
  | "articleCoverTemplate"
  | "appStoreProductShowcase"
  | "budgetAppComparison";

export type MarketingAsset = {
  role: MarketingAssetRole;
  src: string;
  width: number;
  height: number;
  alt: string;
  decorative: boolean;
  priority: boolean;
  placement: string;
};

export const marketingAssets = {
  homepageHeroProduct: {
    role: "homepageHeroProduct",
    src: "/marketing/home/homepage-hero-product.png",
    width: 1672,
    height: 941,
    alt: "Pip app screen showing Spendable Cash Today beside the Pip character.",
    decorative: false,
    priority: true,
    placement: "Homepage hero product visual.",
  },
  bankBalanceComparison: {
    role: "bankBalanceComparison",
    src: "/marketing/home/bank-balance-vs-spendable-cash.png",
    width: 1672,
    height: 941,
    alt: "A comparison between a traditional bank balance and Pip's Spendable Cash Today number.",
    decorative: false,
    priority: false,
    placement: "Homepage bank-balance contrast section.",
  },
  cuteSeriousCharacter: {
    role: "cuteSeriousCharacter",
    src: "/marketing/home/cute-on-purpose-serious-character.png",
    width: 1122,
    height: 1402,
    alt: "Pip holding a small branch with a calm expression.",
    decorative: false,
    priority: false,
    placement: "Meet Pip personality section.",
  },
  pipEmotionalStates: {
    role: "pipEmotionalStates",
    src: "/marketing/home/pip-emotional-state-set.png",
    width: 1448,
    height: 1086,
    alt: "Three Pip expressions showing happy, concerned, and calm states.",
    decorative: false,
    priority: false,
    placement: "Static emotional-state strip in the Meet Pip section.",
  },
  pricingIllustration: {
    role: "pricingIllustration",
    src: "/marketing/home/pricing-section-illustration.png",
    width: 1448,
    height: 1086,
    alt: "Pip with trust and no-ads symbols supporting the paid pricing model.",
    decorative: false,
    priority: false,
    placement: "Pricing section and pricing page support visual.",
  },
  securityTrustIllustration: {
    role: "securityTrustIllustration",
    src: "/marketing/home/security-trust-illustration.png",
    width: 1448,
    height: 1086,
    alt: "Pip beside a phone that lists security assurances.",
    decorative: false,
    priority: false,
    placement: "Security page trust visual.",
  },
  howPipWorksSteps: {
    role: "howPipWorksSteps",
    src: "/marketing/home/how-pip-works-three-step-set.png",
    width: 1672,
    height: 941,
    alt: "Three product screens showing account connection, cushion setup, and checking Spendable Cash Today.",
    decorative: false,
    priority: false,
    placement: "How-it-works page primary visual.",
  },
  founderInsight: {
    role: "founderInsight",
    src: "/marketing/home/founder-insight-illustration.png",
    width: 1672,
    height: 941,
    alt: "A person checking a phone beside Pip and a Spendable Cash Today card.",
    decorative: false,
    priority: false,
    placement: "Founder/problem story section.",
  },
  ogImage: {
    role: "ogImage",
    src: "/marketing/social/og-image.png",
    width: 1731,
    height: 909,
    alt: "Pip with the Spendable Cash Today product screen.",
    decorative: false,
    priority: true,
    placement: "Default social preview image.",
  },
  articleCoverTemplate: {
    role: "articleCoverTemplate",
    src: "/marketing/blog/article-cover-template.png",
    width: 1672,
    height: 941,
    alt: "Pip on a calm editorial cover layout.",
    decorative: false,
    priority: false,
    placement: "Blog cards and article cover fallback.",
  },
  appStoreProductShowcase: {
    role: "appStoreProductShowcase",
    src: "/marketing/store/app-store-product-showcase.png",
    width: 1448,
    height: 1086,
    alt: "Two product phone screens beside Pip showing the daily number and chat.",
    decorative: false,
    priority: false,
    placement: "Final app-access band.",
  },
  budgetAppComparison: {
    role: "budgetAppComparison",
    src: "/marketing/home/budget-app-comparison-illustration.png",
    width: 1672,
    height: 941,
    alt: "A comparison between budget apps, spreadsheets, bank apps, and Pip's one daily number.",
    decorative: false,
    priority: false,
    placement: "Not-another-budget-app comparison section.",
  },
} satisfies Record<MarketingAssetRole, MarketingAsset>;

export const requiredMarketingAssetRoles = Object.keys(marketingAssets) as MarketingAssetRole[];
