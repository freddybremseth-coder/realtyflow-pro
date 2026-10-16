import assert from "node:assert/strict";
import test from "node:test";
import { resolveDevelopmentRepository, suggestDevelopmentRepository } from "./development-repository";
test("repository proposal is deterministic and allowlisted", () => {
  assert.equal(suggestDevelopmentRepository({ brandKey: "altovena" }), "altovena");
  assert.equal(suggestDevelopmentRepository({ request: "Fortsett Altovena Visibility" }), "altovena");
  assert.equal(suggestDevelopmentRepository({ pagePath: "/content-studio" }), "realtyflow");
  assert.equal(resolveDevelopmentRepository("altovena"), "freddybremseth-coder/Altovena");
  assert.equal(resolveDevelopmentRepository("arbitrary/repository"), null);
});
