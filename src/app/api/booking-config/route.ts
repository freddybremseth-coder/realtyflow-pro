import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BRANDS } from "@/lib/constants";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function defaultBookingConfig(brandId: string) {
  const brand = BRANDS.find((item) => item.id === brandId) || BRANDS[0];
  const isRealEstate = brand.type === "real_estate";
  const isAI = brand.id === "chatgenius";
  const isFreddy = brand.id === "freddyb" || brand.id === "freddy";

  return {
    published: false,
    brandId: brand.id,
    domain: brand.website?.replace(/^https?:\/\//, "") || brand.name,
    siteName: brand.name,
    bookingUrl: `${brand.website?.replace(/^https?:\/\//, "") || brand.id}/book`,
    accent: isAI ? "violet" : isRealEstate ? "leaf" : "amber",
    profile: {
      name: brand.name,
      initials: brand.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      role: isAI ? "AI og salg for bedrifter" : isRealEstate ? "Bolig i Spania" : "Rådgivning og strategi",
      location: isRealEstate ? "Costa Blanca · Spania" : "Norge · Spania · Remote",
      tz: "Europa/Madrid (CET)",
      bio: brand.description || "",
    },
    page: {
      eyebrow: isAI ? "AI og salg" : isRealEstate ? "Bolig i Spania" : "Book rådgivning",
      title: isAI ? "Book en AI- og salgssamtale" : isRealEstate ? "Book en samtale om bolig i Spania" : "Book rådgivning",
      lead: brand.target_audience || brand.description || "",
      intro: [brand.description || "Velg møte og tidspunkt som passer."],
    },
    services: [
      {
        id: `${brand.id}-intro-call`,
        icon: isAI ? "Spark" : isFreddy ? "Briefcase" : "Phone",
        iconStyle: isAI ? "violet" : isRealEstate ? "leaf" : "amber",
        title: isAI ? "AI-mulighetssamtale" : isRealEstate ? "Første boligsamtale" : "Strategisamtale",
        subtitle: "Første avklaring",
        duration: 30,
        durationLabel: "30 min",
        price: "Gratis",
        priceNote: "uforpliktende",
        paid: false,
        format: "Google Meet / telefon",
        blurb: "En uforpliktende samtale for å avklare behov, muligheter og neste steg.",
        cta: "Book gratis samtale",
        intakeTitle: "Hjelp oss forberede samtalen",
        intakeFields: [
          { type: "text", id: "topic", label: "Hva ønsker du hjelp med?", placeholder: "Skriv kort hva du ønsker å snakke om.", required: true },
          { type: "textarea", id: "note", label: "Hva bør vi vite før møtet?", placeholder: "Kort beskrivelse.", required: false },
        ],
      },
    ],
    crossLinks: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const brandId = request.nextUrl.searchParams.get("brand_id") || request.nextUrl.searchParams.get("brand") || "zeneco";
  if (!supabase) return NextResponse.json({ config: defaultBookingConfig(brandId) });

  const { data, error } = await supabase
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data?.settings?.booking || defaultBookingConfig(brandId) });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const brandId = String(body.brand_id || body.brandId || "").trim();
  const booking = body.booking;
  if (!brandId || !booking) {
    return NextResponse.json({ error: "brand_id and booking are required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  const settings = {
    ...(existing?.settings || {}),
    booking: {
      ...booking,
      brandId,
      updatedAt: new Date().toISOString(),
    },
  };

  const { error } = await supabase
    .from("brand_settings")
    .upsert({ brand_id: brandId, settings, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, config: settings.booking });
}
