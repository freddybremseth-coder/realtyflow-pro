import fs from "node:fs";

const preview = fs.readFileSync("src/app/api/nexus/criteria-activation/preview/route.ts", "utf8");
const page = fs.readFileSync("src/app/(content)/nexus-os/stage-readiness/criteria-activation/page.tsx", "utf8");
const readiness = fs.readFileSync("src/app/(content)/nexus-os/stage-readiness/page.tsx", "utf8");

const checks = [
  [preview.includes("buildImportedLeadIntelligence"), "preview must reuse existing Buyer Intelligence"],
  [preview.includes("buyerProfileUpdated: false"), "preview must be read-only for Buyer Profile"],
  [preview.includes("workItemCreated: false"), "preview must not create review work automatically"],
  [page.includes("/api/nexus/buyer-intake/attach"), "criteria activation must reuse governed Buyer Intake attach"],
  [page.includes("window.confirm"), "review creation must require explicit operator confirmation"],
  [page.includes("Ingen e-post, pipeline-endring eller automatisk Buyer Profile-write"), "UI must state no automatic external/profile mutation"],
  [readiness.includes('row.readiness==="MISSING_CRITERIA"'), "Stage Readiness must route missing criteria explicitly"],
  [readiness.includes("/nexus-os/stage-readiness/criteria-activation?contactId="), "missing criteria must deep-link to contact-specific activation"],
];

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message);
}

console.log("Nexus criteria activation contract: OK");
