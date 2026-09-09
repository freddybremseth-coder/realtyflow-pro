import assert from "node:assert/strict";
import { buildEmailProviderConfig } from "./provider-config";

const hostinger = buildEmailProviderConfig("hostinger", {});
assert.deepEqual(hostinger, {
  imap_host: "imap.hostinger.com",
  imap_port: 993,
  imap_secure: true,
  smtp_host: "smtp.hostinger.com",
  smtp_port: 465,
  smtp_secure: true,
});

const gmail = buildEmailProviderConfig("gmail", {});
assert.equal(gmail?.imap_host, "imap.gmail.com");
assert.equal(gmail?.smtp_host, "smtp.gmail.com");

const custom = buildEmailProviderConfig("custom", {
  imapHost: "mail.soleada.no",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.soleada.no",
  smtpPort: 465,
  smtpSecure: true,
});
assert.deepEqual(custom, {
  imap_host: "mail.soleada.no",
  imap_port: 993,
  imap_secure: true,
  smtp_host: "smtp.soleada.no",
  smtp_port: 465,
  smtp_secure: true,
});

assert.equal(buildEmailProviderConfig("custom", { imapHost: "imap.example.com" }), null);
assert.equal(buildEmailProviderConfig("custom", { imapHost: "imap.example.com", smtpHost: "smtp.example.com", imapPort: 70000 }), null);
assert.equal(buildEmailProviderConfig("unknown" as never, {}), null);

console.log("email provider config tests passed");
