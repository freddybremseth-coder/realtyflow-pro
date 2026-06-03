/**
 * Grov bot-/spamdeteksjon. Brukes både ved inntak (/api/public/leads) for å
 * avvise søppel før det havner i CRM, og i nurture-motoren som siste skanse
 * før utsending (beskytter avsenderomdømmet).
 *
 * Fanger de vanligste søppelinnsendingene, konservativt nok til at ekte navn
 * som "Maria" eller "David Brooks" går klar:
 *  - Gmail "punktum-triks": mange punktum i lokaldelen (gmail ignorerer dem).
 *  - Tilfeldige navn uten mellomrom med mange store bokstaver midt i ordet.
 */
export function isLikelyBot(name: string, email: string): boolean {
  const local = String(email || "").split("@")[0] || "";
  const dotCount = (local.match(/\./g) || []).length;
  if (dotCount >= 4) return true;

  const trimmed = String(name || "").trim();
  if (!trimmed.includes(" ") && trimmed.length >= 12) {
    const midUppercase = (trimmed.slice(1).match(/[A-Z]/g) || []).length;
    if (midUppercase >= 3) return true;
  }
  return false;
}
