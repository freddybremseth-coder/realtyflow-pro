import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeadWorklistNextAction,
  compareLeadWorklistNextActionPriority,
  leadWorklistNextActionPriorityRank,
  type LeadWorklistNextActionInput,
} from "./worklist-next-action";

const BASE: LeadWorklistNextActionInput = {
  analysisRunId: "analysis-1",
  contactLinked: true,
  criterionCount: 4,
  shortlistCount: 1,
  latestShortlistStatus: "approved",
  latestShortlistItemCount: 3,
  latestPresentationId: "presentation-1",
  latestPresentationStatus: "approved",
  latestMessageDraftId: "message-1",
  latestMessageDraftStatus: "approved",
  purchaseReadiness: "warm",
};

test("lead worklist next action blocks unsafe continuation without analysis run", () => {
  const action = buildLeadWorklistNextAction({ ...BASE, analysisRunId: null });

  assert.equal(action.priority, "HIGH");
  assert.match(action.label, /analyser/i);
});

test("lead worklist next action prioritizes CRM contact linking before sales work", () => {
  const action = buildLeadWorklistNextAction({
    ...BASE,
    contactLinked: false,
    shortlistCount: 0,
    latestPresentationId: null,
    latestMessageDraftId: null,
  });

  assert.equal(action.priority, "CRITICAL");
  assert.match(action.label, /CRM-kontakt/i);
  assert.match(action.reason, /samme person/i);
});

test("lead worklist next action escalates hot leads without shortlist", () => {
  const action = buildLeadWorklistNextAction({
    ...BASE,
    shortlistCount: 0,
    latestShortlistStatus: null,
    latestShortlistItemCount: 0,
    latestPresentationId: null,
    latestMessageDraftId: null,
    purchaseReadiness: "hot",
  });

  assert.equal(action.priority, "CRITICAL");
  assert.match(action.label, /shortlist/i);
});

test("lead worklist next action moves from presentation to message draft", () => {
  const action = buildLeadWorklistNextAction({
    ...BASE,
    latestMessageDraftId: null,
    latestMessageDraftStatus: null,
  });

  assert.equal(action.priority, "HIGH");
  assert.match(action.label, /e-postutkast/i);
});

test("lead worklist next action lowers priority after approved message draft", () => {
  const action = buildLeadWorklistNextAction(BASE);

  assert.equal(action.priority, "LOW");
  assert.match(action.label, /oppfølging/i);
});

test("lead worklist next action ranks urgent profiles before low-touch follow-up", () => {
  assert.equal(leadWorklistNextActionPriorityRank("CRITICAL") > leadWorklistNextActionPriorityRank("HIGH"), true);
  assert.equal(leadWorklistNextActionPriorityRank("HIGH") > leadWorklistNextActionPriorityRank("MEDIUM"), true);
  assert.equal(leadWorklistNextActionPriorityRank("MEDIUM") > leadWorklistNextActionPriorityRank("LOW"), true);

  const sorted = [
    { priority: "LOW" as const, label: "Planlegg oppfølging", reason: "lav risiko" },
    { priority: "CRITICAL" as const, label: "Koble kontakt", reason: "mangler CRM-kobling" },
    { priority: "HIGH" as const, label: "Lag shortlist", reason: "mangler shortlist" },
  ].sort(compareLeadWorklistNextActionPriority);

  assert.deepEqual(sorted.map((item) => item.priority), ["CRITICAL", "HIGH", "LOW"]);
});
