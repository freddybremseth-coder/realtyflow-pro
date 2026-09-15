import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/victoria/route.ts"),
  "utf8",
);
const actionRouteSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/actions/route.ts"),
  "utf8",
);
const contactFieldActionRouteSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/contact-field-action/route.ts"),
  "utf8",
);
const governedActionsSource = fs.readFileSync(
  path.join(process.cwd(), "src/lib/nexus-ai-governed-actions.ts"),
  "utf8",
);
const widgetSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/chatbot/chat-widget.tsx"),
  "utf8",
);
const layoutSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/layout.tsx"),
  "utf8",
);
const clientSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/ai/nexus-ai-client.ts"),
  "utf8",
);
const commandSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/layout/universal-nexus-command.tsx"),
  "utf8",
);
const executionConsoleSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/agentic/jarvis-overlay.tsx"),
  "utf8",
);
const cockpitSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/(tools)/nexus/page.tsx"),
  "utf8",
);
const draftToolSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/tools/communications/create-draft.ts"),
  "utf8",
);
const adapterSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/agentic/adapters.ts"),
  "utf8",
);

test("Nexus AI uses live page context and current customer context", () => {
  assert.match(routeSource, /body\?\.visitorInfo\?\.page/);
  assert.match(routeSource, /current_customer: currentContact/);
  assert.match(routeSource, /\/customers\/\$\{encodeURIComponent/);
});

test("Nexus AI reuses existing pipeline movement and deterministic navigation", () => {
  assert.match(routeSource, /assessPipelineMovement/);
  assert.match(routeSource, /filterNexusCommands/);
  assert.match(routeSource, /top_actions: topActions/);
  assert.match(routeSource, /actions: navigationCandidates/);
});

test("Nexus AI keeps advice read-only and exposes governed action cards separately", () => {
  assert.match(routeSource, /Selve rådgivningskallet er read-only/);
  assert.match(routeSource, /buildNexusActionProposals/);
  assert.match(routeSource, /proposedActions/);
  assert.match(widgetSource, /executeGovernedAction/);
  assert.match(widgetSource, /\/api\/nexus\/actions/);
  assert.match(widgetSource, /\/api\/nexus\/contact-field-action/);
});

test("governed actions are allowlisted and server-reverified before any write", () => {
  assert.match(governedActionsSource, /"prepare_customer_email"/);
  assert.match(governedActionsSource, /"schedule_customer_followup"/);
  assert.match(governedActionsSource, /"add_customer_note"/);
  assert.match(governedActionsSource, /"create_customer_task"/);
  assert.match(governedActionsSource, /"update_customer_email"/);
  assert.match(governedActionsSource, /"update_customer_phone"/);
  assert.match(governedActionsSource, /email_suppressed/);
  assert.match(governedActionsSource, /do_not_contact/);
  assert.match(actionRouteSource, /requireAdminApi/);
  assert.match(actionRouteSource, /getRequestAccessContext/);
  assert.match(actionRouteSource, /buildNexusActionProposals/);
  assert.match(actionRouteSource, /verifiedProposal\.id !== proposalId/);
  assert.doesNotMatch(actionRouteSource, /raw\s*sql|execute\s*sql/i);
});

test("email action creates draft plus pending approval and never sends directly", () => {
  assert.match(actionRouteSource, /buildCreateDraftTool/);
  assert.match(actionRouteSource, /buildRequestApprovalTool/);
  assert.match(actionRouteSource, /gatedActionClass: "send_personal"/);
  assert.match(actionRouteSource, /decisionMode: "human-required"/);
  assert.match(actionRouteSource, /state: "waiting_approval"/);
  assert.match(actionRouteSource, /Ingenting er sendt ennå/);
  assert.doesNotMatch(actionRouteSource, /executeApproval/);
  assert.doesNotMatch(actionRouteSource, /sendBrandEmail/);
});

test("v3 follow-up action is deterministic, internal and reuses CRM timeline validation", () => {
  assert.match(governedActionsSource, /messageRequestsFollowupSchedule/);
  assert.match(governedActionsSource, /parseFollowupDate/);
  assert.match(governedActionsSource, /type: "schedule_customer_followup"/);
  assert.match(governedActionsSource, /requiresApproval: false/);
  assert.match(actionRouteSource, /CustomerTimelineUpdateInputSchema/);
  assert.match(actionRouteSource, /buildCustomerTimelineInteraction/);
  assert.match(actionRouteSource, /appendCustomerInteraction/);
  assert.match(actionRouteSource, /eventType: "followup_scheduled"/);
  assert.match(actionRouteSource, /no_customer_contact: true/);
  assert.match(actionRouteSource, /nexus_action_id: proposalId/);
  assert.match(actionRouteSource, /status === "completed"/);
  assert.match(actionRouteSource, /Ingen melding er sendt/);
});

test("v3 follow-up scheduling does not mutate pipeline or require an email address", () => {
  assert.match(actionRouteSource, /type === "prepare_customer_email" && !contact\.email/);
  assert.doesNotMatch(actionRouteSource, /pipeline_status:\s*"CONTACT"|pipeline_status:\s*"QUALIFIED"|pipeline_status:\s*"MATCHING"/);
  assert.match(governedActionsSource, /requireEmail: false/);
  assert.match(governedActionsSource, /\["WON", "LOST"\]/);
});

test("v4 internal CRM note is explicit, no-send and allowed for documentation-only DNC cases", () => {
  assert.match(governedActionsSource, /messageRequestsCustomerNote/);
  assert.match(governedActionsSource, /type: "add_customer_note"/);
  assert.match(governedActionsSource, /requireContactable: false/);
  assert.match(actionRouteSource, /type !== "add_customer_note"/);
  assert.match(actionRouteSource, /NEXUS_AI_CUSTOMER_NOTE_ADDED/);
  assert.match(actionRouteSource, /eventType: "note"/);
  assert.match(actionRouteSource, /internal_note: true/);
  assert.match(actionRouteSource, /no_customer_contact: true/);
});

test("v4 customer task is internal, idempotent and blocked for active-contact safety boundaries", () => {
  assert.match(governedActionsSource, /messageRequestsCustomerTask/);
  assert.match(governedActionsSource, /type: "create_customer_task"/);
  assert.match(actionRouteSource, /from\("work_items"\)/);
  assert.match(actionRouteSource, /source_id: `nexus-ai-action:\$\{proposalId\}`/);
  assert.match(actionRouteSource, /NEXUS_AI_CUSTOMER_TASK_CREATED/);
  assert.match(actionRouteSource, /eventType: "work_item_created"/);
  assert.match(actionRouteSource, /\["schedule_customer_followup", "create_customer_task"\]/);
  assert.match(actionRouteSource, /\["WON", "LOST"\]/);
});

test("v4 governed action receipts carry stable contact and source identity without revenue inflation", () => {
  assert.match(actionRouteSource, /insertRevenueEvent/);
  assert.match(actionRouteSource, /contactId: String\(params\.contact\.id\)/);
  assert.match(actionRouteSource, /sourceSystem: "nexus_ai_chat"/);
  assert.match(actionRouteSource, /sourceType: "governed_action"/);
  assert.match(actionRouteSource, /sourceId: params\.proposalId/);
  assert.match(actionRouteSource, /buildRevenueEventDedupeKey/);
  assert.doesNotMatch(actionRouteSource, /revenueImpactEur:/);
});

test("v4 partial-write retries repair receipts without repeating the CRM action", () => {
  assert.match(actionRouteSource, /const existingInteraction =/);
  assert.match(actionRouteSource, /let existingTask:/);
  assert.match(actionRouteSource, /NEXUS_AI_ACTION_RECEIPT_RECOVERED/);
  assert.match(actionRouteSource, /receipt_recovered: true/);
  assert.match(actionRouteSource, /existing internal artifact verified; receipt repaired/);
  assert.match(actionRouteSource, /await finishRun\(runStore, runId\)/);
  assert.match(actionRouteSource, /if \(completedRun\(run\)/);
  assert.doesNotMatch(actionRouteSource, /if \(existingInteraction \|\| \(run\?\.status === "completed"/);
});

test("v4 CRM contact field updates are narrow, deterministic and duplicate-safe", () => {
  assert.match(governedActionsSource, /extractCustomerEmailUpdate/);
  assert.match(governedActionsSource, /extractCustomerPhoneUpdate/);
  assert.match(governedActionsSource, /type: "update_customer_email"/);
  assert.match(governedActionsSource, /type: "update_customer_phone"/);
  assert.match(governedActionsSource, /endpoint: "\/api\/nexus\/contact-field-action"/);
  assert.match(contactFieldActionRouteSource, /\["update_customer_email", "update_customer_phone"\]/);
  assert.match(contactFieldActionRouteSource, /expectedField/);
  assert.match(contactFieldActionRouteSource, /buildNexusActionProposals/);
  assert.match(contactFieldActionRouteSource, /verifiedProposal\.field !== field/);
  assert.match(contactFieldActionRouteSource, /from\("contacts"\)\.select\("id,email,phone"\)\.limit\(5000\)/);
  assert.match(contactFieldActionRouteSource, /CONTACT_FIELD_CONFLICT/);
  assert.match(contactFieldActionRouteSource, /\.update\(\{ \[field\]: value, interactions, updated_at: now \}\)/);
  assert.match(contactFieldActionRouteSource, /eventType: "contact_updated"/);
  assert.match(contactFieldActionRouteSource, /no_customer_contact: true/);
  assert.match(contactFieldActionRouteSource, /customer_message_sent: false/);
  assert.doesNotMatch(contactFieldActionRouteSource, /pipeline_status\s*:/);
  assert.doesNotMatch(contactFieldActionRouteSource, /commission_amount|commission_percent|pipeline_value/);
  assert.doesNotMatch(contactFieldActionRouteSource, /sendBrandEmail|executeApproval/);
});

test("chat renders approval and all safe internal CRM actions through one Nexus surface", () => {
  assert.match(widgetSource, /"prepare_customer_email"/);
  assert.match(widgetSource, /"schedule_customer_followup"/);
  assert.match(widgetSource, /"add_customer_note"/);
  assert.match(widgetSource, /"create_customer_task"/);
  assert.match(widgetSource, /"update_customer_email"/);
  assert.match(widgetSource, /"update_customer_phone"/);
  assert.match(widgetSource, /scheduledFor: action\.scheduledFor/);
  assert.match(widgetSource, /field: action\.field/);
  assert.match(widgetSource, /fieldValue: action\.fieldValue/);
  assert.match(widgetSource, /fetch\(action\.endpoint/);
  assert.match(widgetSource, /Intern CRM-handling · sender ingenting/);
  assert.match(widgetSource, /Krever godkjenning før sending/);
  assert.match(widgetSource, /governedActionSuccessCopy/);
});

test("Nexus AI system prompt describes the v4 write boundary without claiming direct execution", () => {
  assert.match(routeSource, /planlegge CRM-oppfølging/);
  assert.match(routeSource, /lagre et internt CRM-notat/);
  assert.match(routeSource, /opprette en intern kundeoppgave/);
  assert.match(routeSource, /E-posthandlingen kan bare opprette et utkast/);
  assert.match(routeSource, /endrer aldri pipeline-status/);
  assert.match(routeSource, /Dokumentert provisjon er den kanoniske revenue truth/);
});

test("Nexus AI customer drafts preserve brand through the existing executor path", () => {
  assert.match(draftToolSource, /brandId: z\.string/);
  assert.match(adapterSource, /brand_id: input\.brandId/);
  assert.match(adapterSource, /brandId: data\.brand_id/);
  assert.match(actionRouteSource, /brandId: contact\.brand_id \|\| contact\.brand/);
});

test("Nexus AI is OpenAI-primary with a configured reserve provider chain", () => {
  assert.match(routeSource, /askNexusAI/);
  assert.match(clientSource, /OPENAI_NEXUS_MODEL \|\| "gpt-5\.6"/);
  assert.match(clientSource, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(clientSource, /askClaude\(prompt/);
  assert.match(clientSource, /provider: "fallback"/);
});

test("chat persists recent history and renders navigation plus governed action shortcuts", () => {
  assert.match(widgetSource, /window\.localStorage\.getItem/);
  assert.match(widgetSource, /window\.localStorage\.setItem/);
  assert.match(widgetSource, /msg\.actions/);
  assert.match(widgetSource, /href=\{action\.href\}/);
  assert.match(widgetSource, /msg\.proposedActions/);
});

test("global shell presents Nexus AI as the single conversational advisor", () => {
  assert.match(layoutSource, /title="Nexus AI"/);
  assert.match(layoutSource, /Din rådgiver på tvers av RealtyFlow/);
});

test("Cmd-K is navigation-only and does not create a second AI conversation", () => {
  assert.match(commandSource, /Søk i RealtyFlow/);
  assert.match(commandSource, /Dette vinduet er kun for navigasjon/);
  assert.doesNotMatch(commandSource, /askNexus/);
  assert.doesNotMatch(commandSource, /\/api\/nexus\/victoria/);
});

test("legacy Jarvis is an advanced execution console without a global launcher or Cmd-K conflict", () => {
  assert.match(executionConsoleSource, /Nexus Execution Console/);
  assert.match(executionConsoleSource, /ikke en separat chat-assistent/);
  assert.match(executionConsoleSource, /jarvis:open/);
  assert.doesNotMatch(executionConsoleSource, /aria-label="Åpne Jarvis/);
  assert.doesNotMatch(executionConsoleSource, /metaKey|ctrlKey/);
});

test("Nexus cockpit exposes execution as a tool, not Jarvis as another assistant", () => {
  assert.match(cockpitSource, /Execution Console/);
  assert.match(cockpitSource, /openExecutionConsole/);
  assert.doesNotMatch(cockpitSource, />\s*Jarvis\s*</);
});
