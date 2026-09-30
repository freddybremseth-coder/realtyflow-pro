import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicRequest = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/saas/demosites/request/route.ts"),
  "utf8",
);
const internalOrders = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/saas/demosites/route.ts"),
  "utf8",
);
const followup = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/demosites-followup/route.ts"),
  "utf8",
);
const classicRenderer = fs.readFileSync(
  path.join(process.cwd(), "src/components/demosites/demo-site-preview-renderer.tsx"),
  "utf8",
);
const signatureRenderer = fs.readFileSync(
  path.join(process.cwd(), "src/components/demosites/demo-signature-site-renderer.tsx"),
  "utf8",
);

describe("DemoSites conversion and quality contract", () => {
  it("marks public demo requests as customer initiated and internal demos as seller generated", () => {
    expect(publicRequest).toContain('order_origin: "customer_initiated"');
    expect(publicRequest).toContain('source_channel: "public_demo_request"');
    expect(internalOrders).toContain('order_origin: String(incomingEditableFields.order_origin || "seller_generated")');
    expect(internalOrders).toContain('source_channel: String(incomingEditableFields.source_channel || "realtyflow_internal")');
  });

  it("never treats an unpaid internal demo as a started subscription or paid SaaS revenue", () => {
    expect(internalOrders).not.toContain("subscription_started_at: new Date().toISOString()");
    expect(internalOrders).not.toContain("subscription_renews_at: plusOneMonthIso()");
    expect(internalOrders).toContain("total_users: summary.paidOrders");
    expect(internalOrders).toContain("total_revenue: summary.paidRevenue");
    expect(internalOrders).toContain("mrr: summary.paidMrr");
    expect(internalOrders).toContain("pipelineMrr");
  });

  it("only auto-follows customer-initiated unpaid preview requests and uses English sales copy", () => {
    expect(followup).toContain('getOrigin(row.editable_fields) !== "customer_initiated"');
    expect(followup).toContain('.neq("billing_status", "paid")');
    expect(followup).toContain("Your website demo");
    expect(followup).toContain("Would you like us to launch");
    expect(followup).toContain('language: "en"');
  });

  it("enforces responsive typography and touch targets in both renderer families", () => {
    for (const source of [classicRenderer, signatureRenderer]) {
      expect(source).toContain("demo-public-site");
      expect(source).toContain("min-height: 44px");
      expect(source).toContain("text-wrap: balance");
      expect(source).toContain("@media (max-width: 767px)");
    }
  });
});
