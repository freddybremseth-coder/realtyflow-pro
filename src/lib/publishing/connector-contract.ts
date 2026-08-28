import { PUBLISHING_CHANNELS, type PublishingChannelId } from "./distribution";

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

/** Secret-free payload handed to provider-specific workers after approval. */
export function buildConnectorEnvelope(
  channel: PublishingChannelId,
  project: Record<string, any>,
  artifactManifest: Record<string, unknown>,
) {
  const definition = PUBLISHING_CHANNELS[channel];
  const metadata = asObject(project.metadata_plan);
  const retailer = Object.keys(asObject(metadata.kdp)).length ? asObject(metadata.kdp) : metadata;
  return {
    schema: "realtyflow.book-distribution.v1",
    channel,
    transport: definition.deliveryMode,
    requires_connection: definition.requiresConnection,
    project: {
      id: String(project.id),
      title: String(project.title || "").trim(),
      subtitle: String(project.subtitle || retailer.subtitle || "").trim(),
      language: String(project.language || "en").trim(),
      author: String(metadata.author || "Freddy Bremseth").trim(),
      series_name: String(project.series_name || "").trim(),
    },
    retailer_metadata: {
      description: String(retailer.description_html || retailer.description || "").trim(),
      keywords: list(retailer.keywords ?? metadata.keywords),
      categories: list(retailer.categories ?? metadata.categories),
    },
    artifacts: artifactManifest,
  };
}
