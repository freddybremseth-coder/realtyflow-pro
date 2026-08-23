/**
 * Komposisjons-rot for lead-intake i PRODUKSJON: kobler Agentic Core-portene
 * til Supabase-adaptere + ekte AI-ekstraksjon, bak dependency injection.
 * Automatisk kundekommunikasjon aktiveres ikke — sending gates via approval.
 */

import type { AccessRole } from "@/lib/access-control";
import { ToolRegistry } from "@/lib/agentic/tool-registry";
import { buildFindPropertiesTool } from "@/services/tools/property/find-properties";
import { buildCreateDraftTool } from "@/services/tools/communications/create-draft";
import { buildRequestApprovalTool } from "@/services/tools/crm/request-approval";
import { buildSaveBuyerProfileTool } from "@/services/tools/crm/save-buyer-profile";
import { runLeadIntake, type LeadIntakeDeps, type RawInquiry } from "@/services/workflows/lead-intake";
import { extractProfile } from "@/services/agentic/extract-profile";
import {
  makeApprovalStore,
  makeBuyerProfileStore,
  makeDraftStore,
  makeInventoryQuery,
  makePublishEvent,
  makeSupabaseAgentRunStore,
  type SupabaseLike,
} from "@/services/agentic/adapters";

export function buildLeadIntakeRuntime(supabase: SupabaseLike, role: AccessRole): LeadIntakeDeps {
  const registry = new ToolRegistry();
  registry.register(buildFindPropertiesTool({ queryInventory: makeInventoryQuery(supabase) }));
  registry.register(buildCreateDraftTool(makeDraftStore(supabase)));
  registry.register(buildRequestApprovalTool(makeApprovalStore(supabase)));
  registry.register(buildSaveBuyerProfileTool(makeBuyerProfileStore(supabase)));

  return {
    registry,
    runStore: makeSupabaseAgentRunStore(supabase),
    role,
    extractProfile,
    publishEvent: makePublishEvent(supabase),
  };
}

export async function runLeadIntakeProduction(supabase: SupabaseLike, inquiry: RawInquiry, role: AccessRole) {
  return runLeadIntake(inquiry, buildLeadIntakeRuntime(supabase, role));
}
