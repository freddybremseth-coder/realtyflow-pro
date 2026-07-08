import assert from "node:assert/strict";
import test from "node:test";

import {
  isRemasterBrand,
  REMASTER_OAUTH_RETURN_PATH,
  remasterOAuthRedirectUrl,
  resolveRemasterAdminUrl,
} from "./oauth-return";

test("recognizes both current and transitional Remaster brand IDs", () => {
  assert.equal(isRemasterBrand("remasterfreddy"), true);
  assert.equal(isRemasterBrand("Re-Master_Freddy"), true);
  assert.equal(isRemasterBrand("neuralbeat"), true);
  assert.equal(isRemasterBrand("zeneco"), false);
});

test("uses a same-origin OAuth bridge path", () => {
  assert.equal(REMASTER_OAUTH_RETURN_PATH, "/oauth/remaster-return");
});

test("accepts HTTP admin URLs and rejects unsafe protocols", () => {
  assert.equal(
    resolveRemasterAdminUrl("https://remaster.freddybremseth.com/admin"),
    "https://remaster.freddybremseth.com/admin",
  );
  assert.equal(
    resolveRemasterAdminUrl("javascript:alert(1)"),
    "https://remasterfreddy.vercel.app/admin",
  );
});

test("forwards only OAuth result parameters to Remaster admin", () => {
  const redirect = remasterOAuthRedirectUrl(
    "https://realtyflow.chatgenius.pro/oauth/remaster-return?oauth_success=true&brand=remasterfreddy&count=1&next=https%3A%2F%2Fevil.example",
    "https://remaster.freddybremseth.com/admin?source=realtyflow",
  );

  assert.equal(
    redirect.toString(),
    "https://remaster.freddybremseth.com/admin?source=realtyflow&oauth_success=true&brand=remasterfreddy&count=1",
  );
});
