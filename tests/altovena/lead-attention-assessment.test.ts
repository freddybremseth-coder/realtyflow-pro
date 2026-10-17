import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessAltovenaLeadPoll } from "../../src/lib/altovena/lead-attention-assessment";

const now=Date.parse("2026-10-17T12:00:00.000Z");
const task=(id:string,status:"TO_DO"|"IN_PROGRESS"|"REVIEW"="TO_DO",
    createdAt:string|null="2026-10-17T11:50:00.000Z")=>
  ({id,status,createdAt});

test("first successful poll establishes baseline, never raises false new-lead notice",()=>{
  const result=assessAltovenaLeadPoll({
    previousIds:null,tasks:[task("one"),task("two")],capped:false,nowMs:now,
  });
  assert.deepEqual(result,{newArrivals:0,awaitingMoreThan24h:0,mightHaveMore:false});
});

test("a newly observed task triggers in-session indicator, an identical poll does not",()=>{
  const previous=new Set(["one"]);
  assert.equal(assessAltovenaLeadPoll({previousIds:previous,
    tasks:[task("one"),task("two")],capped:false,nowMs:now}).newArrivals,1);
  assert.equal(assessAltovenaLeadPoll({previousIds:new Set(["one","two"]),
    tasks:[task("one"),task("two")],capped:false,nowMs:now}).newArrivals,0);
  assert.equal(assessAltovenaLeadPoll({previousIds:new Set(["one","two"]),
    tasks:[task("two")],capped:false,nowMs:now}).newArrivals,0);
});

test("in progress tasks never contribute to not-yet-started follow-up escalation",()=>{
  const tasks=[
    task("a","TO_DO","2026-10-16T11:59:59.000Z"),
    task("b","REVIEW","2026-10-16T12:00:00.000Z"),
    task("c","IN_PROGRESS","2026-10-15T10:00:00.000Z"),
    task("d","TO_DO","2026-10-18T10:00:00.000Z"),
    task("e","TO_DO","unknown"),
  ];
  const result=assessAltovenaLeadPoll({
    previousIds:new Set(),tasks,capped:false,nowMs:now,
  });
  assert.equal(result.awaitingMoreThan24h,2);
  assert.equal(result.newArrivals,5);
});

test("a capped response reports an incomplete-list risk, not an exact total",()=>{
  const result=assessAltovenaLeadPoll({
    previousIds:null,tasks:[task("only")],capped:true,nowMs:now,
  });
  assert.equal(result.mightHaveMore,true);
});

test("component renders scoped in-app notice only, has no email/push mutations",()=>{
  const text=readFileSync("src/components/workspaces/altovena-lead-attention.tsx","utf8");
  assert.match(text,/assessAltovenaLeadPoll/);
  assert.match(text,/previousSuccessfulIds\.current=nextIds/);
  assert.match(text,/setCapped\(assessment\.mightHaveMore\)/);
  assert.match(text,/newArrivals>0/);
  assert.match(text,/grensen på 40 oppgaver/);
  assert.match(text,/Ingen e-post eller pushvarsler er aktivert/);
  assert.doesNotMatch(text,/Notification\.requestPermission|new Notification|sendEmail\(|sendPush\(/);
});
