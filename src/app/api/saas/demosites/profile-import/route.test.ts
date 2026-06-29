import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import {
  setProfileImportDnsLookupForTests,
  setProfileImportFetchForTests,
  setProfileImportSupabaseFactoryForTests,
} from "@/lib/demosites-profile-import";
import { POST } from "./route";

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://realtyflow.test/api/saas/demosites/profile-import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function htmlResponse(html: string) {
  return Promise.resolve(
    new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

function publicDns() {
  setProfileImportDnsLookupForTests(async () => [{ address: "93.184.216.34", family: 4 }]);
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "profile-import-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  setProfileImportFetchForTests(null);
  setProfileImportDnsLookupForTests(null);
  setProfileImportSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  setProfileImportFetchForTests(null);
  setProfileImportDnsLookupForTests(null);
  setProfileImportSupabaseFactoryForTests(null);
});

test("profile import rejects localhost and private website URLs before fetch", async () => {
  let fetchCalls = 0;
  setProfileImportFetchForTests((async () => {
    fetchCalls += 1;
    return htmlResponse("<html></html>");
  }) as typeof fetch);

  for (const website_url of ["http://localhost", "https://10.0.0.5"]) {
    const response = await POST(request({ website_url }, { cookie: await adminCookie() }) as any);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /public|company website/i);
  }

  assert.equal(fetchCalls, 0);
});

test("profile import detects restaurant websites and returns editable fields", async () => {
  publicDns();
  const calls: string[] = [];
  setProfileImportFetchForTests((async (url: string) => {
    calls.push(url);
    if (url.endsWith("/meny")) {
      return htmlResponse(`
        <html><body>
          <h1>Meny og selskapsmeny</h1>
          <p>Lunsjretter fra kr 189</p>
          <p>Middagsretter fra kr 269</p>
          <p>Send bordforespørsel for grupper og private arrangementer.</p>
        </body></html>
      `);
    }

    return htmlResponse(`
      <html>
        <head>
          <title>Fjord Bistro - Restaurant i Sandefjord</title>
          <meta name="description" content="Restaurant med lunsj, middag, selskaper og bordbestilling.">
          <meta property="og:title" content="Fjord Bistro">
          <meta property="og:description" content="Meny, åpningstider og bordforespørsel for Fjord Bistro.">
          <meta property="og:image" content="/hero.jpg">
          <meta name="theme-color" content="#b45309">
          <link rel="apple-touch-icon" href="/apple-touch.png">
        </head>
        <body>
          <img class="site-logo" src="/logo.png" alt="Fjord Bistro logo">
          <img src="/restaurant-room.jpg" alt="Restaurant lokale">
          <h1>Restaurant og selskapslokale i Sandefjord</h1>
          <h2>Meny</h2>
          <p>Lunsj, middag og sesongbaserte retter for små og store bord.</p>
          <p>Bordbestilling og selskapsforespørsel besvares raskt av restaurantteamet.</p>
          <p>Kontakt oss på bord@fjordbistro.no eller +47 33 44 55 66.</p>
          <p>Adresse: Brygga 12, 3210 Sandefjord</p>
          <a href="/meny">Se meny</a>
        </body>
      </html>
    `);
  }) as typeof fetch);

  const response = await POST(
    request(
      {
        website_url: "https://restaurant.example.com",
        company_name: "Fjord Bistro",
      },
      { cookie: await adminCookie() },
    ) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profile.company_name, "Fjord Bistro");
  assert.equal(body.profile.recommended_template_slug, "restaurant");
  assert.equal(body.profile.logo_url, "https://restaurant.example.com/logo.png");
  assert.equal(body.profile.colors.primary, "#b45309");
  assert.equal(body.profile.contact.email, "bord@fjordbistro.no");
  assert.equal(body.profile.source_pages.length, 2);
  assert.equal(body.editable_fields.template_slug, "restaurant");
  assert.equal(body.editable_fields.brand_color, "#b45309");
  assert.equal(calls.length, 2);
});

test("profile import falls back to local-service for unknown businesses", async () => {
  publicDns();
  setProfileImportFetchForTests((async () =>
    htmlResponse(`
      <html>
        <head><title>Nordvik Partner AS</title><meta name="description" content="Lokal bedrift med rådgivning og oppfølging."></head>
        <body>
          <h1>Nordvik Partner AS</h1>
          <p>Vi hjelper lokale kunder med rådgivning, oppfølging og praktisk koordinering.</p>
          <p>Kontakt oss for en uforpliktende prat om behovet ditt.</p>
        </body>
      </html>
    `)) as typeof fetch);

  const response = await POST(
    request({ website_url: "https://unknown.example.com", company_name: "Nordvik Partner AS" }, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();
  const serialized = JSON.stringify(body).toLowerCase();

  assert.equal(response.status, 200);
  assert.equal(body.profile.recommended_template_slug, "local-service");
  assert.equal(serialized.includes("elektriker"), false);
  assert.equal(serialized.includes("el-sjekk"), false);
});

test("profile import saves base order fields when optional import columns are missing", async () => {
  publicDns();
  setProfileImportFetchForTests((async () =>
    htmlResponse(`
      <html>
        <head><title>Fjord Bistro</title><meta name="description" content="Restaurant med bordbestilling og meny."></head>
        <body><h1>Restaurant med lunsj og middag</h1><p>Bordbestilling for grupper.</p></body>
      </html>
    `)) as typeof fetch);

  const calls: Array<{ method: string; args: unknown[] }> = [];
  let updateCount = 0;
  const builder: any = {
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return builder;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return builder;
    },
    update(...args: unknown[]) {
      updateCount += 1;
      calls.push({ method: "update", args });
      return {
        eq(...eqArgs: unknown[]) {
          calls.push({ method: "eq", args: eqArgs });
          return Promise.resolve(
            updateCount === 1
              ? { data: null, error: { message: "Could not find the 'recommended_template_slug' column in schema cache" } }
              : { data: null, error: null },
          );
        },
      };
    },
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve({ data: { id: "order-1", editable_fields: { logo_url: "old-logo" } }, error: null });
    },
  };

  setProfileImportSupabaseFactoryForTests(() => ({
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
  }));

  const response = await POST(
    request(
      { website_url: "https://restaurant.example.com", company_name: "Fjord Bistro", order_id: "order-1" },
      { cookie: await adminCookie() },
    ) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateCount, 2);
  assert.equal(body.warnings.some((warning: string) => warning.includes("Optional profile import columns")), true);
  assert.equal(calls.some((call) => call.method === "update"), true);
});
