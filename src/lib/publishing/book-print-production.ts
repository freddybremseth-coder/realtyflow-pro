export type PrintPaper = "cream" | "white";

export type PrintProductionProfile = {
  trimWidthIn: number;
  trimHeightIn: number;
  bleedIn: number;
  paper: PrintPaper;
  blackAndWhite: boolean;
};

export const DEFAULT_KDP_PRINT_PROFILE: PrintProductionProfile = {
  trimWidthIn: 6,
  trimHeightIn: 9,
  bleedIn: 0.125,
  paper: "cream",
  blackAndWhite: true,
};

const SPINE_PER_PAGE_IN: Record<PrintPaper, number> = {
  cream: 0.0025,
  white: 0.002252,
};

export function normalizePrintPageCount(pageCount: number) {
  const count = Math.max(1, Math.trunc(Number(pageCount || 0)));
  return count % 2 === 0 ? count : count + 1;
}

export function kdpSpineWidthIn(pageCount: number, paper: PrintPaper = "cream") {
  return normalizePrintPageCount(pageCount) * SPINE_PER_PAGE_IN[paper];
}

export function kdpFullCoverDimensionsIn(
  pageCount: number,
  profile: PrintProductionProfile = DEFAULT_KDP_PRINT_PROFILE,
) {
  const pages = normalizePrintPageCount(pageCount);
  const spineWidthIn = kdpSpineWidthIn(pages, profile.paper);
  return {
    pageCount: pages,
    spineWidthIn,
    widthIn: profile.trimWidthIn * 2 + spineWidthIn + profile.bleedIn * 2,
    heightIn: profile.trimHeightIn + profile.bleedIn * 2,
  };
}

export function inchesToPoints(value: number) {
  return value * 72;
}

export function printProfileSummary(pageCount: number, profile: PrintProductionProfile = DEFAULT_KDP_PRINT_PROFILE) {
  const dimensions = kdpFullCoverDimensionsIn(pageCount, profile);
  return {
    ...profile,
    ...dimensions,
    trimWidthPt: inchesToPoints(profile.trimWidthIn),
    trimHeightPt: inchesToPoints(profile.trimHeightIn),
    fullCoverWidthPt: inchesToPoints(dimensions.widthIn),
    fullCoverHeightPt: inchesToPoints(dimensions.heightIn),
    productionStatus: "publication_ready" as const,
  };
}
