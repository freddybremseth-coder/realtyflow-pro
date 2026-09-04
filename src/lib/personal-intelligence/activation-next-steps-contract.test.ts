import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const orient = read("src/app/(content)/personal-intelligence/orient/page.tsx");
const interview = read("src/app/(content)/personal-intelligence/interview/page.tsx");
const map = read("src/app/(content)/personal-intelligence/map/page.tsx");

test("activation sequence has explicit next-step navigation", () => {
  assert.match(orient, /href="\/personal-intelligence\/interview"/);
  assert.match(interview, /href="\/personal-intelligence\/map"/);
  assert.match(map, /href="\/personal-intelligence"/);
});

test("next-step additions are navigation only", () => {
  for (const source of [orient, interview, map]) {
    assert.doesNotMatch(source, /Next step[\s\S]{0,1200}(insert|update|delete|upsert)/i);
  }
});
