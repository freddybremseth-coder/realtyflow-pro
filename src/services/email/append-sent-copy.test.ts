import assert from "node:assert/strict";
import test from "node:test";
import { appendHostingerSentCopy } from "./append-sent-copy";

const account = {
  brand_id: "soleada",
  email_address: "sender@example.com",
  imap_host: "imap.example.com",
  smtp_host: "smtp.example.com",
};

test("non-Hostinger mailboxes are not appended to Sent a second time", async () => {
  assert.equal(await appendHostingerSentCopy(account, {
    to: ["buyer@example.com"],
    subject: "Hello",
    bodyText: "Body",
  }, "<smtp-message@example.com>"), "unsupported");
});

test("missing SMTP Message-ID cannot manufacture a Sent copy", async () => {
  assert.equal(await appendHostingerSentCopy({ ...account, imap_host: "imap.hostinger.com" }, {
    to: ["buyer@example.com"],
    subject: "Hello",
    bodyText: "Body",
  }, undefined), "failed");
});
