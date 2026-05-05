// ===== BRANDS =====
export interface Brand {
  id: string;
  name: string;
  type: "real_estate" | "saas" | "agriculture" | "personal" | "music" | "publishing" | "tourism" | "ecommerce" | "other";
  description: string;
  color: string;
  logo_url?: string;
  website?: string;
  email?: string;
  contact_phone?: string;
  tone?: string;
  target_audience?: string;
  specialties?: string[];
}

// ===== LEADS & CRM =====
export type LeadStatus =
  | "NEW"
  | "CONTACT"
  | "QUALIFIED"
  | "VIEWING"
  | "NEGOTIATION"
  | "WON"
  | "ON_HOLD"
  | "LOST";

export interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  source?: string;
  status: LeadStatus;
  budget?: number;
  currency?: string;
  location?: string;
  notes?: string;
  sentiment_score?: number;
  urgency_score?: number;
  intent_score?: number;
  personality_profile?: string;
  viewing_scheduled_date?: string;
  nurture_sequence_step?: number;
  created_at: string;
  updated_at: string;
}

export type CustomerStatus = "ACTIVE" | "VIP" | "INACTIVE" | "CLOSED";
export type CustomerType = "BUYER" | "SELLER" | "INVESTOR" | "RENTER";

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  nationality?: string;
  location?: string;
  budget?: number;
  status: CustomerStatus;
  customer_type: CustomerType;
  properties_interested?: string[];
  transaction_history?: string;
  notes?: string;
  last_contact?: string;
  created_at: string;
  updated_at: string;
}

// ===== PROPERTIES =====
export interface Property {
  id: string;
  ref?: string;
  price: number;
  property_type: string;
  location: string;
  coordinates?: { lat: number; lng: number };
  bedrooms?: number;
  bathrooms?: number;
  plot_size?: number;
  built_area?: number;
  terrace_size?: number;
  pool?: boolean;
  title_no?: string;
  title_en?: string;
  title_es?: string;
  description_no?: string;
  description_en?: string;
  description_es?: string;
  primary_image?: string;
  gallery?: string[];
  energy_rating?: string;
  date_updated?: string;
  created_at: string;
}

// ===== APPOINTMENTS =====
export type AppointmentType =
  | "VIEWING"
  | "MEETING"
  | "CALL"
  | "VALUATION"
  | "SIGNING"
  | "OTHER";
export type AppointmentStatus = "CONFIRMED" | "PENDING" | "COMPLETED" | "CANCELLED";

export interface Appointment {
  id: string;
  title: string;
  type: AppointmentType;
  date: string;
  time: string;
  duration?: number;
  location?: string;
  contact_email?: string;
  contact_phone?: string;
  notes?: string;
  status: AppointmentStatus;
  created_at: string;
}

// ===== CONTENT & POSTS =====
export type PostStatus = "draft" | "scheduled" | "published" | "failed";
export type Platform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "twitter"
  | "tiktok"
  | "youtube";

export interface Post {
  id: string;
  content: string;
  media_urls?: string[];
  platforms: Platform[];
  status: PostStatus;
  brand_id?: string;
  scheduled_at?: string;
  published_at?: string;
  virality_score?: number;
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    reach?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface ContentGeneration {
  id: string;
  brand_id: string;
  platform: Platform;
  content: string;
  variants?: string[];
  hashtags?: string[];
  agent_used: string;
  virality_score?: number;
  tone?: string;
  goal?: string;
  created_at: string;
}

// ===== AI AGENTS =====
export interface AgentTask {
  id: string;
  name: string;
  description: string;
  priority: "low" | "medium" | "high";
  deadline?: string;
  parameters?: Record<string, unknown>;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
}

export interface ContentStrategy {
  tone: "professional" | "casual" | "viral" | "educational" | "entertaining";
  target_audience: string;
  key_messages: string[];
  cta: string;
  hashtags: string[];
  estimated_reach: number;
}

// ===== MARKETING =====
export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "DONE";

export interface MarketingTask {
  id: string;
  title: string;
  description?: string;
  platform: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaign {
  id: string;
  headline: string;
  body: string;
  image_url?: string;
  objective?: string;
  platform?: string;
  viral_impact_score?: number;
  brand_id?: string;
  created_at: string;
}

// ===== VALUATIONS =====
export interface Valuation {
  id: string;
  property_ref?: string;
  estimated_price_low: number;
  estimated_price_agent: number;
  estimated_price_high: number;
  comparable_properties?: unknown[];
  market_analysis?: string;
  created_at: string;
}

// ===== YOUTUBE & NEURAL BEAT =====
export interface YouTubeVideo {
  id: string;
  title: string;
  description?: string;
  youtube_url?: string;
  youtube_id?: string;
  tags?: string[];
  thumbnail_url?: string;
  views?: number;
  likes?: number;
  brand_id?: string;
  created_at: string;
}

export interface PipelineRun {
  id: string;
  type: "neural_beat" | "brand_video";
  status: "processing" | "completed" | "failed";
  steps_completed: string[];
  current_step?: string;
  error?: string;
  song_name?: string;
  youtube_url?: string;
  started_at: string;
  completed_at?: string;
}

// ===== EMAIL AUTOMATION =====
export type EmailDirection = "inbound" | "outbound";
export type EmailIntent = "inquiry" | "viewing_request" | "offer" | "complaint" | "follow_up" | "general";
export type EmailUrgency = "low" | "medium" | "high" | "critical";
export type EmailSentiment = "positive" | "neutral" | "negative";
export type EmailDraftStatus = "draft" | "approved" | "sent" | "discarded";

export interface BrandEmailConfig {
  id: string;
  brand_id: string;
  email_address: string;
  display_name?: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  auto_fetch: boolean;
  fetch_interval_minutes: number;
  ai_auto_draft: boolean;
  signature?: string;
  is_active: boolean;
  last_fetched_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  id: string;
  brand_id: string;
  message_id?: string;
  thread_id?: string;
  direction: EmailDirection;
  from_address: string;
  from_name?: string;
  to_addresses: string[];
  cc_addresses?: string[];
  subject?: string;
  body_text?: string;
  body_html?: string;
  attachments?: unknown[];
  ai_summary?: string;
  ai_intent?: EmailIntent;
  ai_language?: string;
  ai_urgency?: EmailUrgency;
  ai_sentiment?: EmailSentiment;
  ai_suggested_action?: string;
  matched_lead_id?: string;
  matched_customer_id?: string;
  matched_property_ids?: string[];
  matched_plot_ids?: string[];
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  has_draft_reply: boolean;
  replied_at?: string;
  received_at: string;
  created_at: string;
}

export interface EmailDraft {
  id: string;
  email_message_id: string;
  brand_id: string;
  to_addresses: string[];
  subject?: string;
  body_text: string;
  body_html?: string;
  ai_model?: string;
  ai_context?: Record<string, unknown>;
  ai_confidence?: number;
  tone?: string;
  language?: string;
  status: EmailDraftStatus;
  edited_by_user: boolean;
  sent_at?: string;
  created_at: string;
  updated_at: string;
}

// ===== SETTINGS =====
export type AppLanguage = "NO" | "EN" | "ES" | "DE" | "RU" | "FR";

export interface Settings {
  id: string;
  user_id: string;
  language: AppLanguage;
  market_pulse_enabled?: boolean;
  brand_identity_guard_enabled?: boolean;
  social_sync_enabled?: boolean;
  lead_nurture_enabled?: boolean;
}
