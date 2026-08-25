export type CreativeMutationAxis =
  | "composition"
  | "context"
  | "hook"
  | "cta"
  | "crop";

const MUTATIONS: Array<{ axis: CreativeMutationAxis; instruction: string }> = [
  { axis: "composition", instruction: "Keep the same proven concept but change camera angle, subject placement and negative-space balance while preserving product identity." },
  { axis: "context", instruction: "Keep the same proven concept but place it in a fresh, believable context for the same audience without inventing claims or product features." },
  { axis: "hook", instruction: "Keep visual identity recognizable but strengthen the first-second attention pattern through a clearer focal point and more immediate visual contrast." },
  { axis: "cta", instruction: "Preserve the winning visual idea while creating cleaner intentional space for a different CTA/copy treatment. Do not render text inside the image." },
  { axis: "crop", instruction: "Preserve the winning concept and product fidelity, but explore a materially different crop and depth treatment optimized for paid social." },
];

export function planCreativeMutations(count: number) {
  const total = Math.max(1, Math.min(20, Math.round(count || 1)));
  return Array.from({ length: total }, (_, index) => {
    const base = MUTATIONS[index % MUTATIONS.length];
    const cycle = Math.floor(index / MUTATIONS.length) + 1;
    return {
      axis: base.axis,
      instruction: `${base.instruction} Mutation cycle ${cycle}; make this variant visibly distinct from sibling variants without changing the core proposition.`,
      ordinal: index + 1,
    };
  });
}

export function variantPrompt(parentPrompt: string, mutationInstruction: string) {
  return `${String(parentPrompt || "").trim()}\n\nCONTROLLED WINNER VARIANT\n${mutationInstruction}`.trim();
}

export function variantCta(parentCta: string | null | undefined, ordinal: number) {
  const options = [parentCta || "Les mer", "Se mer", "Oppdag mer", "Finn ut mer", "Ta neste steg"];
  return options[(Math.max(1, ordinal) - 1) % options.length];
}
