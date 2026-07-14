import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  DeleteBuyerProfilesInputSchema,
  LeadIntelligencePersistenceError,
  type DeleteBuyerProfilesInput,
} from "./persistence";

export interface BuyerProfileDeleteStore {
  listExisting(brand: string, buyerProfileIds: string[]): Promise<string[]>;
  deleteExisting(brand: string, buyerProfileIds: string[]): Promise<string[]>;
}

function normalizeIds(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort();
}

export async function deleteBuyerProfilesThroughStore(
  store: BuyerProfileDeleteStore,
  input: DeleteBuyerProfilesInput,
) {
  const data = DeleteBuyerProfilesInputSchema.parse(input);
  const requestedIds = normalizeIds(data.buyerProfileIds);
  const existingIds = normalizeIds(await store.listExisting(data.brand, requestedIds));

  if (existingIds.length === 0) {
    return {
      brand: data.brand,
      deletedBuyerProfileIds: [],
      missingBuyerProfileIds: requestedIds,
      deletedCount: 0,
      missingCount: requestedIds.length,
    };
  }

  const deletedIds = normalizeIds(await store.deleteExisting(data.brand, existingIds));
  const deletedSet = new Set(deletedIds);
  const missingIds = requestedIds.filter((id) => !deletedSet.has(id));

  return {
    brand: data.brand,
    deletedBuyerProfileIds: deletedIds,
    missingBuyerProfileIds: missingIds,
    deletedCount: deletedIds.length,
    missingCount: missingIds.length,
  };
}

export function createSupabaseBuyerProfileDeleteStore() : BuyerProfileDeleteStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new LeadIntelligencePersistenceError(
      "DATABASE_ERROR",
      "Supabase service role is not configured for buyer profile deletion",
      500,
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async listExisting(brand, buyerProfileIds) {
      const { data, error } = await supabase
        .from("buyer_profiles")
        .select("id")
        .eq("brand", brand)
        .in("id", buyerProfileIds);
      if (error) {
        throw new LeadIntelligencePersistenceError("DATABASE_ERROR", "Buyer profiles could not be read before deletion", 500);
      }
      return (data || []).map((row) => String(row.id));
    },

    async deleteExisting(brand, buyerProfileIds) {
      const { data, error } = await supabase
        .from("buyer_profiles")
        .delete()
        .eq("brand", brand)
        .in("id", buyerProfileIds)
        .select("id");
      if (error) {
        throw new LeadIntelligencePersistenceError("DATABASE_ERROR", "Buyer profiles could not be deleted", 500);
      }
      return (data || []).map((row) => String(row.id));
    },
  };
}
