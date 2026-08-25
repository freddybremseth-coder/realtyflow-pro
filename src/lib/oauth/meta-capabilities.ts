export type MetaPlatform = "facebook" | "instagram";

export type MetaCapabilities = {
  publish: boolean;
  readEngagement: boolean;
  directMessages: boolean;
  commentReply: boolean;
};

export const META_PUBLISHING_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_read_user_content",
  "business_management",
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_content_publish",
] as const;

export const META_COMMUNICATION_SCOPES = [
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_manage_comments",
  "instagram_manage_messages",
] as const;

export function evaluateMetaCapabilities(platform: string, scopesInput: unknown): MetaCapabilities {
  const scopes = new Set(Array.isArray(scopesInput) ? scopesInput.map(String) : []);
  if (platform === "facebook") {
    return {
      publish: scopes.has("pages_manage_posts"),
      readEngagement: scopes.has("pages_read_engagement") || scopes.has("pages_read_user_content"),
      directMessages: scopes.has("pages_manage_metadata") && scopes.has("pages_messaging"),
      commentReply: scopes.has("pages_manage_engagement"),
    };
  }
  if (platform === "instagram") {
    return {
      publish: scopes.has("instagram_content_publish") || scopes.has("instagram_business_content_publish"),
      readEngagement: scopes.has("pages_read_engagement") || scopes.has("instagram_basic") || scopes.has("instagram_business_basic"),
      directMessages:
        (scopes.has("instagram_manage_messages") && scopes.has("pages_manage_metadata")) ||
        scopes.has("instagram_business_manage_messages"),
      commentReply: scopes.has("instagram_manage_comments") || scopes.has("instagram_business_manage_comments"),
    };
  }
  return { publish: false, readEngagement: false, directMessages: false, commentReply: false };
}

export function isMetaCommunicationReady(platform: string, scopesInput: unknown) {
  const capabilities = evaluateMetaCapabilities(platform, scopesInput);
  return capabilities.directMessages && capabilities.commentReply;
}
