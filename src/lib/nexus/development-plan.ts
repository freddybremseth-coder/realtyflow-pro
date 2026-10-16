import { createHash } from "node:crypto";
import { suggestDevelopmentRepository, resolveDevelopmentRepository } from "./development-repository";

export interface DevelopmentPlan {
  taskId: string;
  repository: string;
  objective: string;
  steps: string[];
  acceptanceCriteria: string[];
  requiresApproval: true;
  executionEnabled: false;
  planHash: string;
}

export function createDevelopmentPlan(task: {
  id: string;
  request_text: string;
  brand_key?: string | null;
  source_path?: string | null;
}): DevelopmentPlan {
  const repository = resolveDevelopmentRepository(suggestDevelopmentRepository({
    brandKey: task.brand_key, pagePath: task.source_path, request: task.request_text,
  }));
  if (!repository || !task.id || !task.request_text?.trim()) throw new Error("Invalid development task");
  const steps = [
    "Undersøk relevant kildekode og dokumentasjon i valgt repository",
    "Beskriv berørte filer og foreslå minste sikre endring",
    "Avklar risiko, testplan og krav til godkjenning før kodeskriving",
    "Etter særskilt godkjenning: opprett egen gren og pull request",
    "Verifiser CI, preview og dokumenter resultat før publisering",
  ];
  const acceptanceCriteria = [
    "Oppgaven løses uten tap av eksisterende funksjoner eller data",
    "Tilgangskontroll og merkevareisolasjon er bevart",
    "Endringer testes før merge og produksjon",
    "Ingen produksjonspublisering uten egen eksplisitt godkjenning",
  ];
  const objective = task.request_text.trim().slice(0, 5000);
  const serialized = JSON.stringify({ id: task.id, repository, objective, steps, acceptanceCriteria });
  return {
    taskId: task.id, repository, objective, steps, acceptanceCriteria,
    requiresApproval: true, executionEnabled: false,
    planHash: createHash("sha256").update(serialized).digest("hex"),
  };
}
