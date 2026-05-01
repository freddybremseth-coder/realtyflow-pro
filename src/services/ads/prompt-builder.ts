// ─── Prompt builder: label preservation pattern ─────────────────────────
// Validated approach for Flux Kontext Pro: pair the visual reference with
// a verbatim text description of every label/typography element.

const QUALITY_TAIL =
  "Hyperrealistic, sharp focus on label, magazine-quality commercial photography, refined elegance.";

export interface PromptBuilderInput {
  product_name: string;        // "Doña Anna Verde Alto olive oil bottle"
  label_description: string;   // verbatim label content + bottle/container description
  scene_body: string;          // contains {LABEL} placeholder
}

/**
 * Builds the canonical reference string used in every prompt:
 *   "this exact <product_name>, preserving every label detail: <label_description>"
 */
export function buildLabelString(product_name: string, label_description: string): string {
  return `this exact ${product_name}, preserving every label detail: ${label_description}`;
}

/**
 * Replaces {LABEL} in a scene template with the resolved label string,
 * appends the standard quality tail if missing.
 */
export function buildPrompt(input: PromptBuilderInput): string {
  const label = buildLabelString(input.product_name, input.label_description);
  let prompt = input.scene_body.replace(/\{LABEL\}/g, label);
  if (!/Hyperrealistic|magazine-quality/i.test(prompt)) {
    prompt = `${prompt} ${QUALITY_TAIL}`;
  }
  return prompt.trim();
}
