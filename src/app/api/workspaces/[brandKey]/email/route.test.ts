import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { setWorkspaceEmailRuntimeForTests } from "@/lib/workspaces/email-runtime";
import { GET, POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const draftId = "33333333-3333-4333-8333-333333333333";
let permissions: string[] = ["email.read","email.draft","email.send","crm.read"];
const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
const sendCalls: any[] = [];
const updateCalls: any[] = [];
let suppression = { blocked: false, blockedEmails: [] as string[], error: undefined as string | undefined };
let campaignOutput = JSON.stringify({
  subject: "Nyttig Pinoso-guide",
  preheader: "Et konkret råd før boligkjøpet",
  bodyText: "Hei! Her er et nyttig råd om Pinoso.",
});

function terminal(result: any = { data: null, error: null }) {
  const q: any = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    limit: () => q,
    order: () => q,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function fakeDb() {
  return {
    rpc(name: string, args?: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === "workspace_login_directory") {
        return Promise.resolve({
          data: { user_id: userId, username: "andrea", email: "staff@example.test", display_name: "Andrea", status: "active" },
          error: null,
        });
      }
      if (name === "workspace_brand_grant") {
        const brand = String(args?.p_brand_key || "");
        return Promise.resolve({
          data: {
            brand: { id: brand === "pinosoecolife" ? "pinoso-id" : "zen-id", brand_key: brand },
            grant: brand === "pinosoecolife" ? {
              brand_id: "pinoso-id", user_id: userId, email: "staff@example.test",
              status: "active", permissions,
            } : null,
          },
          error: null,
        });
      }
      if (name === "workspace_brand_email_snapshot") {
        return Promise.resolve({
          data: {
            targets: [{
              type: "lead", id: targetId, label: "Pinoso Lead",
              email: "lead@example.test", subtitle: "QUALIFIED",
            }],
            drafts: [],
          },
          error: null,
        });
      }
      if (name === "workspace_brand_email_draft_save") {
        return Promise.resolve({
          data: {
            id: draftId,
            targetType: args?.p_target_type,
            targetId: args?.p_target_id,
            recipientEmail: "lead@example.test",
            recipientLabel: "Pinoso Lead",
            subject: args?.p_subject,
            bodyText: args?.p_body_text,
            status: "draft",
          },
          error: null,
        });
      }
      if (name === "workspace_brand_email_send_prepare") {
        return Promise.resolve({
          data: {
            id: draftId, targetType: "lead", targetId,
            recipientEmail: "lead@example.test", recipientLabel: "Pinoso Lead",
            subject: "Follow up", bodyText: "Useful follow-up",
          },
          error: null,
        });
      }
      if (name === "workspace_brand_email_send_finalize") {
        return Promise.resolve({ data: { ok: args?.p_success, id: draftId }, error: null });
      }
      throw new Error("Unexpected RPC " + name);
    },
    from(table: string) {
      if (table === "brand_email_configs") {
        return terminal({
          data: {
            id: "config-id", brand_id: "pinosoecolife",
            email_address: "hello@pinosoecolife.com", display_name: "Pinoso EcoLife",
            smtp_host: "smtp.example.test", smtp_port: 465, smtp_secure: true,
            encrypted_password: "encrypted", encryption_iv: "iv",
            is_active: true, health_status: "healthy",
          },
          error: null,
        });
      }
      if (table === "brand_settings") {
        return terminal({
          data: { settings: { name: "Pinoso EcoLife", description: "Large plots and modern villas inland." } },
          error: null,
        });
      }
      if (table === "email_messages") {
        return {
          insert: async (payload: any) => {
            updateCalls.push({ table, action: "insert", payload });
            return { data: null, error: null };
          },
        };
      }
      if (["contacts","corporate_prospects","corporate_partner_prospects"].includes(table)) {
        const q: any = {
          update: (payload: any) => {
            updateCalls.push({ table, action: "update", payload });
            return q;
          },
          eq: () => q,
          neq: () => q,
          then: (resolve: any, reject: any) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
        };
        return q;
      }
      throw new Error("Unexpected table " + table);
    },
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: "staff@example.test" } }, error: null,
    }) } },
  } as unknown as SupabaseClient;
}

function request(brand = "pinosoecolife", method = "GET", body?: unknown, cookie?: string) {
  return new NextRequest(`https://realtyflow.test/api/workspaces/${brand}/email`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json", origin: "https://realtyflow.test" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let oldFetch: typeof fetch;
test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "workspace-email-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-email.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "workspace-service-key";
  permissions = ["email.read","email.draft","email.send","crm.read"];
  rpcCalls.length = 0;
  sendCalls.length = 0;
  updateCalls.length = 0;
  suppression = { blocked: false, blockedEmails: [], error: undefined };
  campaignOutput = JSON.stringify({
    subject: "Nyttig Pinoso-guide",
    preheader: "Et konkret råd før boligkjøpet",
    bodyText: "Hei! Her er et nyttig råd om Pinoso.",
  });
  setPlatformSupabaseFactoryForTests(() => fakeDb());
  setWorkspaceEmailRuntimeForTests({
    checkSuppression: async () => suppression,
    buildSmtp: async () => ({
      host: "smtp.example.test", port: 465, secure: true,
      email: "hello@pinosoecolife.com", password: "test-only",
      displayName: "Pinoso EcoLife",
    }),
    send: async (config, email) => {
      sendCalls.push({ config, email });
      return { success: true, messageId: "<workspace-test@example.test>" };
    },
    generateCampaign: async (prompt) => {
      sendCalls.push({ campaignPrompt: prompt });
      return campaignOutput;
    },
  });
  oldFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (!String(input).includes("/rest/v1/brand_settings")) throw new Error("Unexpected external request");
    return new Response(JSON.stringify({
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

test.afterEach(() => {
  setPlatformSupabaseFactoryForTests(null);
  setWorkspaceEmailRuntimeForTests(null);
  globalThis.fetch = oldFetch;
});

test("email snapshot stays exact-brand and returns no mail credentials", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await GET(request("pinosoecolife", "GET", undefined, cookie) as any,
    { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.targets[0].email, "lead@example.test");
  assert.equal(body.sender.email, "hello@pinosoecolife.com");
  assert.equal(JSON.stringify(body).includes("encrypted_password"), false);
  assert.equal(JSON.stringify(body).includes("test-only"), false);

  const denied = await GET(request("zeneco", "GET", undefined, cookie) as any,
    { params: { brandKey: "zeneco" } });
  assert.equal(denied.status, 403);
});

test("draft save ignores forged recipient and brand values", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await POST(request("pinosoecolife", "POST", {
    action: "save",
    brand_id: "zeneco",
    recipientEmail: "attacker@example.test",
    targetType: "lead",
    targetId,
    subject: "Relevant follow-up",
    bodyText: "Useful content",
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const call = rpcCalls.find(item => item.name === "workspace_brand_email_draft_save");
  assert.ok(call);
  assert.equal(call?.args?.p_brand_key, "pinosoecolife");
  assert.equal(call?.args?.p_target_id, targetId);
  assert.equal(JSON.stringify(call?.args).includes("attacker@example.test"), false);
  assert.equal(JSON.stringify(call?.args).includes('"zeneco"'), false);
});

test("sending is denied before SMTP without explicit email.send", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  permissions = ["email.read","email.draft","crm.read"];
  const response = await POST(request("pinosoecolife", "POST", {
    action: "send", draftId,
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 403);
  assert.equal(sendCalls.length, 0);
  assert.equal(rpcCalls.some(item => item.name === "workspace_brand_email_send_prepare"), false);
});

test("suppressed recipient is finalized as failed and never reaches SMTP", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  suppression = { blocked: true, blockedEmails: ["lead@example.test"], error: undefined };
  const response = await POST(request("pinosoecolife", "POST", {
    action: "send", draftId, recipientEmail: "attacker@example.test",
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 409);
  assert.equal(sendCalls.length, 0);
  const finalize = rpcCalls.find(item =>
    item.name === "workspace_brand_email_send_finalize" && item.args?.p_success === false);
  assert.ok(finalize);
});

test("successful send uses prepared recipient and exact brand sender then records follow-up", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await POST(request("pinosoecolife", "POST", {
    action: "send", draftId,
    recipientEmail: "attacker@example.test",
    brand_id: "zeneco",
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  assert.equal(sendCalls.length, 1);
  assert.deepEqual(sendCalls[0].email.to, ["lead@example.test"]);
  assert.equal(sendCalls[0].config.email, "hello@pinosoecolife.com");
  assert.equal(JSON.stringify(sendCalls[0]).includes("attacker@example.test"), false);

  const grants = rpcCalls.filter(item => item.name === "workspace_brand_grant");
  assert.ok(grants.length >= 2, "send must revalidate live grant before SMTP");
  const finalized = rpcCalls.find(item =>
    item.name === "workspace_brand_email_send_finalize" && item.args?.p_success === true);
  assert.ok(finalized);
  assert.ok(updateCalls.some(item => item.table === "email_messages" && item.action === "insert"));
  assert.ok(updateCalls.some(item => item.table === "contacts" && item.action === "update"));
});

test("Reach campaign generation is brand-fixed and never starts bulk send or subscription", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("staff@example.test", "WORKSPACE_MEMBER");
  const response = await POST(request("pinosoecolife", "POST", {
    action: "campaign_draft",
    brand_id: "zeneco",
    campaignType: "info",
    topic: "Hvordan velge stor tomt i innlandet",
  }, cookie) as any, { params: { brandKey: "pinosoecolife" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.bulkSendStarted, false);
  assert.equal(body.subscriberCreated, false);
  const generation = sendCalls.find(item => item.campaignPrompt);
  assert.ok(generation);
  assert.match(generation.campaignPrompt, /Pinoso EcoLife/);
  assert.doesNotMatch(generation.campaignPrompt, /brand_id.*zeneco/i);
});
