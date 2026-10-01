// ============================================================================
//  components/marketing/aurora/copy.ts
//  Translated marketing chrome + landing hero, from the design's own I18N
//  tables (en/fr/it/ru/zh). Locales the design doesn't cover (es/ja/ko) fall
//  back to English; the body copy below the hero is English-only by design.
//
//  Kept as a TS table rather than next-intl messages: these strings belong to
//  the marketing pages alone and ship with them, and the design is the
//  source of truth for every language it supplies.
// ============================================================================

type NavCopy = {
  features: string; pricing: string; guides: string; mobile: string; card: string; faq: string; team: string;
  signIn: string; trial: string; language: string; menu: string;
};

type FooterCopy = {
  trial: string; talk: string; note: string; tag: string; product: string; features: string; pricing: string;
  card: string; team: string; legal: string; privacy: string; deletion: string; nz: string; release: string;
};

type HeroCopy = {
  eyebrow: string; h1a: string[]; h1b: string[]; sub: string; trial: string; see: string;
  ctaA: string; ctaB: string; ctaP: string;
};

export type AuroraCopy = { nav: NavCopy; footer: FooterCopy; hero: HeroCopy };

const en: AuroraCopy = {
  nav: { features: "Features", pricing: "Pricing", guides: "Guides", mobile: "Mobile", card: "Card", faq: "FAQ", team: "Team", signIn: "Sign in", trial: "Book a free trial", language: "Language", menu: "Menu" },
  footer: { trial: "Book a free trial", talk: "Talk to a person", note: "No card needed. Set up in minutes.", tag: "The calm way to run a studio.", product: "Product", features: "Features", pricing: "Pricing", card: "Check-in card", team: "Meet the team", legal: "Legal", privacy: "Privacy", deletion: "Data deletion", nz: "Built in New Zealand", release: "General release · December 2026" },
  hero: {
    eyebrow: "For dance studios and creative schools",
    h1a: ["Run", "your", "whole", "studio."],
    h1b: ["Lose", "the", "chaos."],
    sub: "Classes, invoicing, cash flow, families and your website — in one calm home. Log it once. Done.",
    trial: "Book a free trial",
    see: "See it in action",
    ctaA: "Lose the chaos.",
    ctaB: "Keep the dancing.",
    ctaP: "Book a free trial and see your own studio in Olune — your classes, your families, your colour.",
  },
};

const fr: AuroraCopy = {
  nav: { features: "Fonctions", pricing: "Tarifs", guides: "Guides", mobile: "Mobile", card: "Carte", faq: "FAQ", team: "Équipe", signIn: "Se connecter", trial: "Essai gratuit", language: "Langue", menu: "Menu" },
  footer: { trial: "Réserver un essai gratuit", talk: "Parler à quelqu’un", note: "Sans carte bancaire. Prêt en quelques minutes.", tag: "La façon sereine de gérer un studio.", product: "Produit", features: "Fonctions", pricing: "Tarifs", card: "Carte d’accès", team: "L’équipe", legal: "Légal", privacy: "Confidentialité", deletion: "Suppression des données", nz: "Conçu en Nouvelle-Zélande", release: "Lancement · décembre 2026" },
  hero: {
    eyebrow: "Pour les studios de danse et les écoles créatives",
    h1a: ["Gérez", "tout", "votre", "studio."],
    h1b: ["Oubliez", "le", "chaos."],
    sub: "Cours, facturation, trésorerie, familles et votre site — réunis dans un seul lieu serein. Saisissez une fois. C’est fait.",
    trial: "Réserver un essai gratuit",
    see: "Voir en action",
    ctaA: "Oubliez le chaos.",
    ctaB: "Gardez la danse.",
    ctaP: "Réservez un essai gratuit et découvrez votre studio dans Olune — vos cours, vos familles, votre couleur.",
  },
};

const it: AuroraCopy = {
  nav: { features: "Funzioni", pricing: "Prezzi", guides: "Guide", mobile: "Mobile", card: "Tessera", faq: "FAQ", team: "Team", signIn: "Accedi", trial: "Prova gratuita", language: "Lingua", menu: "Menu" },
  footer: { trial: "Prenota una prova gratuita", talk: "Parla con una persona", note: "Nessuna carta richiesta. Pronto in pochi minuti.", tag: "Il modo sereno di gestire uno studio.", product: "Prodotto", features: "Funzioni", pricing: "Prezzi", card: "Tessera d’ingresso", team: "Il team", legal: "Legale", privacy: "Privacy", deletion: "Cancellazione dati", nz: "Creato in Nuova Zelanda", release: "Lancio · dicembre 2026" },
  hero: {
    eyebrow: "Per scuole di danza e studi creativi",
    h1a: ["Gestisci", "tutto", "il", "tuo", "studio."],
    h1b: ["Dimentica", "il", "caos."],
    sub: "Corsi, fatture, flussi di cassa, famiglie e il tuo sito — in un’unica casa tranquilla. Inserisci una volta. Fatto.",
    trial: "Prenota una prova gratuita",
    see: "Guardalo in azione",
    ctaA: "Via il caos.",
    ctaB: "Resta la danza.",
    ctaP: "Prenota una prova gratuita e scopri il tuo studio in Olune — i tuoi corsi, le tue famiglie, il tuo colore.",
  },
};

const ru: AuroraCopy = {
  nav: { features: "Возможности", pricing: "Цены", guides: "Гайды", mobile: "Мобильное", card: "Карта", faq: "Вопросы", team: "Команда", signIn: "Войти", trial: "Попробовать", language: "Язык", menu: "Меню" },
  footer: { trial: "Попробовать бесплатно", talk: "Связаться с нами", note: "Без карты. Настройка за минуты.", tag: "Спокойный способ управлять студией.", product: "Продукт", features: "Возможности", pricing: "Цены", card: "Карта входа", team: "Команда", legal: "Правовое", privacy: "Конфиденциальность", deletion: "Удаление данных", nz: "Сделано в Новой Зеландии", release: "Релиз · декабрь 2026" },
  hero: {
    eyebrow: "Для танцевальных студий и творческих школ",
    h1a: ["Управляйте", "всей", "студией."],
    h1b: ["Без", "хаоса."],
    sub: "Занятия, счета, финансы, семьи и ваш сайт — в одном спокойном месте. Ввели один раз. Готово.",
    trial: "Попробовать бесплатно",
    see: "Посмотреть в деле",
    ctaA: "Без хаоса.",
    ctaB: "Только танец.",
    ctaP: "Попробуйте бесплатно и увидите свою студию в Olune — ваши занятия, ваши семьи, ваш цвет.",
  },
};

const zh: AuroraCopy = {
  nav: { features: "功能", pricing: "价格", guides: "指南", mobile: "移动端", card: "会员卡", faq: "常见问题", team: "团队", signIn: "登录", trial: "免费试用", language: "语言", menu: "菜单" },
  footer: { trial: "预约免费试用", talk: "联系顾问", note: "无需信用卡，几分钟即可开始。", tag: "从容经营工作室的方式。", product: "产品", features: "功能", pricing: "价格", card: "签到卡", team: "团队", legal: "法律", privacy: "隐私", deletion: "数据删除", nz: "新西兰制造", release: "正式发布 · 2026 年 12 月" },
  hero: {
    eyebrow: "为舞蹈工作室与创意学校而生",
    h1a: ["管理", "整个", "工作室。"],
    h1b: ["告别", "混乱。"],
    sub: "课程、账单、现金流、家庭与网站——尽在一个从容的家。录入一次，即可完成。",
    trial: "预约免费试用",
    see: "观看演示",
    ctaA: "告别混乱，",
    ctaB: "专注舞蹈。",
    ctaP: "预约免费试用，在 Olune 中看见你自己的工作室——你的课程、你的家庭、你的颜色。",
  },
};

const TABLE: Record<string, AuroraCopy> = { en, fr, it, ru, zh };

export function auroraCopy(locale: string): AuroraCopy {
  return TABLE[locale] ?? en;
}

/** Short code shown on the language button. */
export function localeShort(locale: string): string {
  if (locale === "zh") return "中文";
  if (locale === "ja") return "日本語";
  if (locale === "ko") return "한국어";
  return locale.toUpperCase();
}

/** Where every "Book a free trial" goes. */
export const TRIAL_HREF = "/onboarding";
export const CONTACT_EMAIL = "hello@olune.co.nz";
