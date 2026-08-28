import assert from "node:assert/strict";
import test from "node:test";
import { buildConnectorEnvelope } from "./connector-contract";

test("Apple and PublishDrive receive a stable secret-free connector contract", () => {
  const project = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "A Book",
    language: "en",
    metadata_plan: { author: "Freddy Bremseth", description_html: "Description", keywords: ["one"], categories: ["two"] },
  };
  for (const channel of ["apple_books", "publishdrive"] as const) {
    const envelope = buildConnectorEnvelope(channel, project, { epub: "/artifact.epub" });
    assert.equal(envelope.schema, "realtyflow.book-distribution.v1");
    assert.equal(envelope.channel, channel);
    assert.equal(envelope.requires_connection, true);
    assert.equal(envelope.project.author, "Freddy Bremseth");
    assert.equal(JSON.stringify(envelope).includes("secret"), false);
    assert.equal(JSON.stringify(envelope).includes("token"), false);
  }
});
