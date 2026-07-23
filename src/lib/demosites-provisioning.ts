import {
  provisionDemoSiteOnHostinger,
  type DemoSiteHostingerOrder,
  type HostingerProvisioningResult,
} from "@/lib/demosites-hostinger";
import type { DemoSiteStatus } from "@/lib/demosites";
import type { DemoSitesSupabaseClientLike } from "@/lib/demosites-api-supabase";

export type DemoSiteProvisioningOrder = DemoSiteHostingerOrder & {
  status?: DemoSiteStatus;
  billing_status?: string | null;
  provisioning_log?: unknown;
};

type Provisioner = (order: DemoSiteHostingerOrder) => Promise<HostingerProvisioningResult>;

let provisionerForTests: Provisioner | null = null;

export function setDemoSiteProvisionerForTests(provisioner: Provisioner | null) {
  provisionerForTests = provisioner;
}

function toLogArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function hasHostingerProvisioningStarted(log: unknown[]) {
  return log.some((item) => {
    const type = String((item as { type?: unknown }).type || "");
    return type === "hostinger_provisioning_queued" || type === "hostinger_provisioning_created";
  });
}

function logTypeForResult(result: HostingerProvisioningResult) {
  if (result.status === "created") return "hostinger_provisioning_created";
  if (result.status === "queued") return "hostinger_provisioning_queued";
  if (result.status === "failed") return "hostinger_provisioning_failed";
  return "hostinger_provisioning_skipped";
}

function deploymentPatchForResult(order: DemoSiteProvisioningOrder, result: HostingerProvisioningResult) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (result.status !== "skipped") patch.deployment_target = "hostinger.com";
  if (result.production_url) patch.production_url = result.production_url;

  if (result.status === "created" && result.production_url) {
    patch.status = "deployed";
    patch.deployed_at = new Date().toISOString();
  } else if (result.status === "queued" && order.status !== "deployed") {
    patch.status = "approved";
    patch.approved_at = new Date().toISOString();
  }

  return patch;
}

function appendProvisioningLog(order: DemoSiteProvisioningOrder, result: HostingerProvisioningResult, source: string) {
  const log = toLogArray(order.provisioning_log);
  return [
    ...log,
    {
      at: new Date().toISOString(),
      type: logTypeForResult(result),
      provider: result.provider,
      mode: result.mode || null,
      source,
      message: result.message,
      production_url: result.production_url || null,
      external_id: result.external_id || null,
      metadata: result.metadata || {},
    },
  ].slice(-25);
}

export async function provisionDemoSiteAfterPayment(
  supabase: DemoSitesSupabaseClientLike,
  order: DemoSiteProvisioningOrder,
  source = "payment_paid",
) {
  const existingLog = toLogArray(order.provisioning_log);
  if (hasHostingerProvisioningStarted(existingLog)) {
    const result: HostingerProvisioningResult = {
      status: "skipped",
      provider: "hostinger",
      message: "Hostinger-oppretting er allerede startet for denne demoen.",
    };
    return { order, result, skippedDuplicate: true };
  }

  const provisioner = provisionerForTests || provisionDemoSiteOnHostinger;
  const result = await provisioner(order);
  const patch = {
    ...deploymentPatchForResult(order, result),
    provisioning_log: appendProvisioningLog(order, result, source),
  };

  const { data, error } = await supabase.from("demo_site_orders").update(patch).eq("id", order.id).select("*").single();
  if (error) throw error;

  return {
    order: (data || { ...order, ...patch }) as DemoSiteProvisioningOrder,
    result,
    skippedDuplicate: false,
  };
}
