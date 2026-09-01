import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/publishing/book-engine/route.ts"), "utf8");
const core = fs.readFileSync(path.join(process.cwd(), "src/app/api/publishing/book-engine/core.ts"), "utf8");

test("public Book Engine route wraps the preserved core implementation", () => {
  assert.match(route, /import \{ GET as coreGET, POST as corePOST \} from "\.\/core";/);
  assert.match(route, /return coreGET\(request\)/);
  assert.match(route, /return corePOST\(request\)/);
  assert.match(core, /export async function GET\(request: NextRequest\)/);
  assert.match(core, /export async function POST\(request: NextRequest\)/);
});

test("only the three Learning-sensitive production modes are guarded", () => {
  assert.match(route, /new Set<LearningOriginGuardMode>\(\["generate_seo", "generate_author", "continue"\]\)/);
  assert.match(route, /if \(!GUARDED_MODES\.has\(mode\)\) return corePOST\(request\)/);
});

test("guard runs after admin auth and project lookup but before core production", () => {
  const authIndex = route.indexOf("requireAdminApi(request)");
  const queryIndex = route.indexOf('.from("publishing_book_projects")');
  const guardIndex = route.indexOf("guardLearningOriginProduction(project as Record<string, any>, mode)");
  const guardedCoreIndex = route.lastIndexOf("return corePOST(request)");
  assert.ok(authIndex >= 0);
  assert.ok(queryIndex > authIndex);
  assert.ok(guardIndex > queryIndex);
  assert.ok(guardedCoreIndex > guardIndex);
  assert.match(route, /learning_origin_guard:\s*true/);
  assert.match(route, /status:\s*learningGuard\.status/);
});

test("wrapper reads a cloned request so delegation receives the original body", () => {
  assert.match(route, /request\.clone\(\)\.json\(\)/);
});
