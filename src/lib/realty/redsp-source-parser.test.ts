import assert from "node:assert/strict";
import test from "node:test";
import { extractRedspEditorialSourceRows } from "./redsp-source-parser";

test("extracts full multilingual description and distinct facing/usage source facts", () => {
  const xml = `
    <root>
      <property>
        <ref>SP100</ref>
        <desc>
          <no><![CDATA[Lang norsk beskrivelse &amp; flere detaljer.<br/>Linje to.]]></no>
          <en>English fallback</en>
        </desc>
        <floor>2</floor>
        <orientation>South</orientation>
        <property_use>Holiday home</property_use>
        <tags>
          <tag>Aircondition</tag>
          <tag>Privat parkering</tag>
          <tag>Aircondition</tag>
        </tags>
      </property>
    </root>`;

  const rows = extractRedspEditorialSourceRows(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.ref, "SP100");
  assert.match(rows[0]?.source_description || "", /Lang norsk beskrivelse & flere detaljer/);
  assert.match(rows[0]?.source_description || "", /Linje to/);
  assert.deepEqual(rows[0]?.amenities_no, ["Aircondition", "Privat parkering"]);
  assert.equal(rows[0]?.floor_label, "2");
  assert.equal(rows[0]?.facing_source, "South");
  assert.equal(rows[0]?.usage_source, "Holiday home");
});

test("falls back to english description and ignores properties without ref", () => {
  const xml = `
    <root>
      <property><desc><no>Ignored</no></desc></property>
      <property>
        <ref>SP200</ref>
        <desc><en>English source description</en></desc>
      </property>
    </root>`;

  const rows = extractRedspEditorialSourceRows(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.ref, "SP200");
  assert.equal(rows[0]?.source_description, "English source description");
  assert.equal(rows[0]?.facing_source, null);
  assert.equal(rows[0]?.usage_source, null);
});
