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

test("Nexus AI v2 keeps advice read-only and exposes governed action cards separately", () => {
  assert.match(routeSource, /Selve rådgivningskallet er read-only også i v2/);
  assert.match(routeSource, /buildNexusActionProposals/);
  assert.match(routeSource, /proposedActions/);
  assert.match(widgetSource, /executeGovernedAction/);
  assert.match(widgetSource, /\/api\/nexus\/actions/);
});

test("governed actions are allowlisted and server-reverified before any write", () => {
  assert.match(governedActionsSource, /NEXUS_GOVERNED_ACTION_TYPES = \["prepare_customer_email"\]/);
  assert.match(governedActionsSource, /email_suppressed/);
  assert.match(governedActionsSource, /do_not_contact/);
  assert.match(actionRouteSource, /requireAdminApi/);
  assert.match(actionRouteSource, /getRequestAccessContext/);
  assert.match(actionRouteSource, /buildNexusActionProposals/);
  assert.match(actionRouteSource, /verifiedProposal\.id !== proposalId/);
  assert.doesNotMatch(actionRouteSource, /raw\s*sql|execute\s*sql/i);
});

test("first v2 action creates draft plus pending approval and never sends directly", () => {
  assert.match(actionRouteSource, /buildCreateDraftTool/);
  assert.match(actionRouteSource, /buildRequestApprovalTool/);
  assert.match(actionRouteSource, /gatedActionClass: "send_personal"/);
  assert.match(actionRouteSource, /decisionMode: "human-required"/);
  assert.match(actionRouteSource, /state: "waiting_approval"/);
  assert.match(actionRouteSource, /Ingenting er sendt ennå/);
  assert.doesNotMatch(actionRouteSource, /executeApproval/);
  assert.doesNotMatch(actionRouteSource, /sendBrandEmail/);
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
  assert.match(widgetSource, /Krever godkjenning før sending/);
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
