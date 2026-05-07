// ─── Plot Assets ─────────────────────────────────────────────────

export type PlotAssetKind = "image" | "document" | "video" | "plan" | "photo" | "other";

export type DistributionTarget =
  | "customer"
  | "content_studio"
  | "email"
  | "portal"
  | "website";

export interface DistributionLogEntry {
  target: DistributionTarget;
  target_id?: string;       // customer id, content item id, etc.
  sent_at: string;          // ISO timestamp
  status: "sent" | "failed";
  detail?: string;
}

export interface PlotAsset {
  id: string;
  plot_id: string;

  filename: string;
  content_type: string | null;
  size_bytes: number;
  storage_path: string;
  public_url: string;
  thumbnail_url: string | null;

  kind: PlotAssetKind;
  title: string | null;
  description: string | null;
  tags: string[];
  display_order: number;

  show_on_website: boolean;
  visible_in_portal: boolean;
  visible_to_customer_ids: string[];

  distribution_log: DistributionLogEntry[];

  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}
