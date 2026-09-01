/** In-page anchor targets (§2.9). Every nav label scrolls to one of these ids;
 *  none is ever a Next.js route. Single source of truth for section ids. */
export const SECTION_IDS = {
  hero: "hero",
  manifesto: "manifesto",
  ritual: "ritual",
  craft: "craft",
  gallery: "gallery",
  cta: "cta",
  contact: "contact",
  footer: "footer",
} as const;

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS];
