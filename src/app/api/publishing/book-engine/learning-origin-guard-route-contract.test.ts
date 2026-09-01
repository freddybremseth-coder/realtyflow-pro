import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/publishing/book-engine/route.ts"), "utf8");

function section(start: string, end: string) {
  const startIndex = route.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing section: ${start}`);
  const endIndex = route.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end section: ${end}`);
  return route.slice(startIndex, endIndex);
}

test("Book Engine imports the Learning-origin production guard", () => {
  assert.match(route, /import \{ guardLearningOriginProduction \} from "@\/lib\/publishing\/book-engine-learning-origin-guard";/);
});

test("generate_seo enforces the Learning-origin production-start guard before mutation", () => {
  const body = section('if (mode === "generate_seo")', 'if (mode === "generate_author")');
  assert.match(body, /guardLearningOriginProduction\(current, "generate_seo"\)/);
  assert.match(body, /learningGuard\.allowed/);
  assert.ok(body.indexOf('guardLearningOriginProduction(current, "generate_seo")') < body.indexOf('.update({'));
});

test("generate_author enforces locked canon before mutation", () => {
  const body = section('if (mode === "generate_author")', 'if (mode === "continue")');
  assert.match(body, /guardLearningOriginProduction\(current, "generate_author"\)/);
  assert.match(body, /learningGuard\.allowed/);
  assert.ok(body.indexOf('guardLearningOriginProduction(current, "generate_author")') < body.indexOf('.update({'));
});

test("continue enforces the Learning-origin author-step guard before generation", () => {
  const body = section('if (mode === "continue")', 'if (mode === "generate_images")');
  assert.match(body, /guardLearningOriginProduction\(project as Record<string, any>, "continue"\)/);
  assert.match(body, /learningGuard\.allowed/);
  assert.ok(body.indexOf('guardLearningOriginProduction(project as Record<string, any>, "continue")') < body.indexOf('generateOutlineIfMissing'));
  assert.ok(body.indexOf('guardLearningOriginProduction(project as Record<string, any>, "continue")') < body.indexOf('generateChapterDraftBatch'));
});
