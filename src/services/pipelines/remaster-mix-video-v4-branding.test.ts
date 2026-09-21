import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConcatVisualFilterV4,
  buildSponsorEnableExpressionV4,
} from "./remaster-mix-video-v4";

test("V4 branding filter keeps both logos persistent and schedules ZenEco sponsor logo", () => {
  const filter = buildConcatVisualFilterV4(
    "/tmp/overlay.ass",
    1,
    2,
    10,
    1300,
  );

  assert.match(filter, /\[1:v\]scale=240/);
  assert.match(filter, /overlay=x=W-w-38:y=28:eof_action=repeat:shortest=0/);
  assert.match(filter, /\[2:v\]split=2/);
  assert.match(filter, /overlay=x=38:y=28:eof_action=repeat:shortest=0/);
  assert.match(filter, /between\(t,600\.000,610\.000\)/);
  assert.match(filter, /between\(t,1200\.000,1210\.000\)/);
});

test("V4 sponsor expression defaults to recurring 10-second windows", () => {
  const expression = buildSponsorEnableExpressionV4(1900, 10);
  assert.equal(
    expression,
    "between(t,600.000,610.000)+between(t,1200.000,1210.000)+between(t,1800.000,1810.000)",
  );
});

test("art and book mixes render full-HD stills at two fps without changing existing realty 6fps",()=>{
  const still=buildConcatVisualFilterV4(null,null,null,10,1800,"contain",2);
  const realty=buildConcatVisualFilterV4(null,null,null,10,1800,"cover");
  assert.match(still,/\[0:v\]fps=2,scale=1920:1080/);
  assert.match(still,/force_original_aspect_ratio=decrease/);
  assert.doesNotMatch(still,/crop=1920:1080/);
  assert.match(realty,/\[0:v\]fps=6,scale=1920:1080/);
});
