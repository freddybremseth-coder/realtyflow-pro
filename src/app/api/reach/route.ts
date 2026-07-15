import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import {
  createReachContact,
  deleteReachContact,
  getReachDnsStatus,
  isReachConfigured,
  listReachContacts,
  listReachGroups,
  listReachProfiles,
} from "@/services/email/reach-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Admin API for the Reach newsletter module.
 *
 *   GET    ?view=overview       → profiles, groups, brand→profile mapping
 *   GET    ?view=contacts&page= → subscriber list
 *   POST   { action: "add_contact", email, name?, surname?, phone?, note?, brand_id? }
 *   POST   { action: "map_profile", brand_id, profile_uuid }
 *   POST   { action: "dns_status", profile_uuid }
 *   DELETE ?uuid=               → remove subscriber
 *
 * Brand→profile mapping lives in the `settings` table
 * (key reach_profile_<brandId>) — each brand sends from its own Reach
 * identity, exactly like the social channels are separated per brand.
 */

const MAPPING_PREFIX = "reach_profile_";

async function readMappings() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .like("key", `${MAPPING_PREFIX}%`);
  const mapping: Record<string, string> = {};
  for (const row of data || []) {
    const brandId = String(row.key).slice(MAPPING_PREFIX.length);
    if (brandId && row.value) mapping[brandId] = String(row.value);
  }
  return mapping;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  if (!isReachConfigured()) {
    return NextResponse.json({ configured: false, error: "HOSTINGER_API_TOKEN er ikke satt i Vercel." });
  }

  const view = request.nextUrl.searchParams.get("view") || "overview";

  try {
    if (view === "contacts") {
      const page = Number(request.nextUrl.searchParams.get("page")) || 1;
      const result = await listReachContacts({ page, perPage: 50 });
      return NextResponse.json({ configured: true, ...result });
    }

    const [profiles, groups, mapping] = await Promise.all([
      listReachProfiles(),
      listReachGroups().catch(() => []),
      readMappings(),
    ]);
    return NextResponse.json({ configured: true, profiles, groups, mapping });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : "Reach-feil" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  if (!isReachConfigured()) {
    return NextResponse.json({ error: "HOSTINGER_API_TOKEN er ikke satt i Vercel." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  try {
    if (action === "add_contact") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return NextResponse.json({ error: "Gyldig e-post er påkrevd." }, { status: 400 });
      }

      let profileUuid: string | undefined;
      const brandId = String(body.brand_id || "").trim();
      if (brandId) {
        const mapping = await readMappings();
        profileUuid = mapping[brandId];
      }

      await createReachContact(
        {
          email,
          name: String(body.name || "").trim() || undefined,
          surname: String(body.surname || "").trim() || undefined,
          phone: String(body.phone || "").trim() || undefined,
          note: String(body.note || "").trim().slice(0, 75) || undefined,
        },
        profileUuid,
      );
      return NextResponse.json({ ok: true, profileUuid: profileUuid || null });
    }

    if (action === "map_profile") {
      const brandId = String(body.brand_id || "").trim();
      const profileUuid = String(body.profile_uuid || "").trim();
      if (!brandId) return NextResponse.json({ error: "brand_id er påkrevd." }, { status: 400 });

      const supabase = createServerClient();
      const { error } = await supabase.from("settings").upsert(
        {
          key: `${MAPPING_PREFIX}${brandId}`,
          value: profileUuid,
          category: "reach",
          description: `Reach-profil (avsenderidentitet) for brand ${brandId}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action === "dns_status") {
      const profileUuid = String(body.profile_uuid || "").trim();
      if (!profileUuid) return NextResponse.json({ error: "profile_uuid er påkrevd." }, { status: 400 });
      const status = await getReachDnsStatus(profileUuid);
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({ error: "Ukjent action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reach-feil" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const uuid = String(request.nextUrl.searchParams.get("uuid") || "").trim();
  if (!uuid) return NextResponse.json({ error: "uuid er påkrevd." }, { status: 400 });

  try {
    await deleteReachContact(uuid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reach-feil" },
      { status: 502 },
    );
  }
}
