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
  | "budgetAppComparison"
  | "homepageBalanceRoom"
  | "homepageHabitShift"
  | "homepageAntiBudget"
  | "homepageHowItWorks"
  | "homepageAskPip"
  | "homepageFinalCta"
  | "blogMeetPipCard"
  | "blogBankBalanceCard"
  | "blogSpendableCashCard";

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
    src: "/marketing/home/homepage-hero-transparent.png",
    width: 951,
    height: 1095,
    alt: "Pip standing in front of a phone showing Spendable Cash Today.",
    decorative: false,
    priority: true,
    placement: "Homepage hero generated transparent product image.",
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
  homepageBalanceRoom: {
    role: "homepageBalanceRoom",
    src: "/marketing/home/balance-room-generated.png",
    width: 1672,
    height: 941,
    alt: "A bank balance, upcoming commitments, and Pip's Spendable Cash Today number in one calm flow.",
    decorative: false,
    priority: false,
    placement: "Homepage balance-room section generated scene.",
  },
  homepageHabitShift: {
    role: "homepageHabitShift",
    src: "/marketing/plan/03-habit-shift.png",
    width: 1651,
    height: 953,
    alt: "A hand checking a bank balance habit beside a hand checking Pip's daily number.",
    decorative: false,
    priority: false,
    placement: "Homepage habit-shift section generated scene.",
  },
  homepageAntiBudget: {
    role: "homepageAntiBudget",
    src: "/marketing/home/anti-budget-poster-v2.png",
    width: 1672,
    height: 941,
    alt: "Pip in a calm product scene beside softened budgeting clutter.",
    decorative: false,
    priority: false,
    placement: "Homepage not-another-budget-app section generated scene.",
  },
  homepageHowItWorks: {
    role: "homepageHowItWorks",
    src: "/marketing/plan/05-how-it-works.png",
    width: 1748,
    height: 900,
    alt: "Four calm steps leading to Pip's Spendable Cash Today screen.",
    decorative: false,
    priority: false,
    placement: "Homepage how-it-works section generated scene.",
  },
  homepageAskPip: {
    role: "homepageAskPip",
    src: "/marketing/home/ask-pip-proof-v2.png",
    width: 1672,
    height: 941,
    alt: "A phone and Pip in a calm Ask Pip conversation scene.",
    decorative: false,
    priority: false,
    placement: "Homepage Ask Pip section generated scene.",
  },
  homepageFinalCta: {
    role: "homepageFinalCta",
    src: "/marketing/home/final-cta-poster-v2.png",
    width: 1672,
    height: 941,
    alt: "Pip and a phone on a warm product stage with space for a call to action.",
    decorative: false,
    priority: false,
    placement: "Homepage final call-to-action generated scene.",
  },
  blogMeetPipCard: {
    role: "blogMeetPipCard",
    src: "/marketing/blog/cards/meet-pip-cute-money-companion.png",
    width: 1586,
    height: 992,
    alt: "Pip beside a phone showing the Spendable Cash Today number.",
    decorative: false,
    priority: false,
    placement: "Homepage blog card for the Meet Pip article.",
  },
  blogBankBalanceCard: {
    role: "blogBankBalanceCard",
    src: "/marketing/blog/cards/why-your-bank-balance-is-misleading.png",
    width: 1586,
    height: 992,
    alt: "A bank balance screen beside layered commitments and Pip.",
    decorative: false,
    priority: false,
    placement: "Homepage blog card for the misleading bank balance article.",
  },
  blogSpendableCashCard: {
    role: "blogSpendableCashCard",
    src: "/marketing/blog/cards/what-is-spendable-cash-today.png",
    width: 1586,
    height: 992,
    alt: "A Pip phone screen showing the daily Spendable Cash Today number.",
    decorative: false,
    priority: false,
    placement: "Homepage blog card for the Spendable Cash Today article.",
  },
} satisfies Record<MarketingAssetRole, MarketingAsset>;

export const requiredMarketingAssetRoles = Object.keys(marketingAssets) as MarketingAssetRole[];
