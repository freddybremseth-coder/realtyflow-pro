export interface AgentTask {
  id: string;
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  deadline?: Date;
  parameters: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
}

export interface ContentStrategy {
  tone: 'professional' | 'casual' | 'viral' | 'educational' | 'entertaining';
  targetAudience: string;
  keyMessages: string[];
  callToAction?: string;
  hashtags: string[];
  estimatedReach?: number;
}

export interface ContentBrief {
  brand: string;
  platform: string;
  goal: 'awareness' | 'engagement' | 'conversion' | 'retention';
  audience: string;
  tone: string;
  keyMessages?: string[];
  constraints?: {
    maxLength?: number;
    includeHashtags?: boolean;
    includeEmojis?: boolean;
    includeLinks?: boolean;
  };
}

export interface GeneratedContent {
  id: string;
  brief: ContentBrief;
  content: string;
  variants: string[];
  hashtags: string[];
  estimatedReach: number;
  viralityScore: number;
  seoScore?: number;
  conversionScore?: number;
  recommendations: string[];
  agents: string[];
}

export interface AgentCommand {
  id: string;
  userId: string;
  agentType: 'marketing' | 'sales' | 'seo' | 'business' | 'multi-domain' | 'youtube';
  taskName: string;
  parameters: Record<string, any>;
  priority: 'low' | 'medium' | 'high';
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ---- YouTube Types ----

export interface YouTubeVideoMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  thumbnailUrl?: string;
  playlistId?: string;
  language?: string;
  imagePrompt?: string;
  /**
   * ISO datetime string. When provided, YouTube uploads the video as PRIVATE
   * and schedules it to go PUBLIC at this timestamp. YouTube requires
   * privacyStatus to be 'private' for scheduling to work — the upload helper
   * coerces this automatically.
   */
  publishAt?: string;
  /**
   * BCP-47 code for the audio language. Use 'zxx' for instrumental music
   * (no linguistic content) — helps YouTube classify and recommend the video.
   */
  defaultAudioLanguage?: string;
  /**
   * Localized title/description per language code (e.g. en, es, no). YouTube
   * shows the matching variant to viewers with that interface language,
   * which improves international search reach and CTR.
   */
  localizations?: Record<string, { title: string; description: string }>;
}

export interface YouTubeUploadResult {
  videoId: string;
  videoUrl: string;
  youtubeUrl: string;
  channelId: string;
  publishedAt: string;
  thumbnailUrl: string;
  privacyStatus?: string;
  tokenSource?: string;
}

// ---- Song / Neural Beat Types ----

export interface SongRecord {
  id: string;
  title: string;
  artist: string;
  audioUrl?: string;
  status?: 'ready' | 'processing' | 'published' | 'error';
  genre?: string;
  mood?: string;
  style?: string;
  energy?: string;
  visualStyle?: string;
  bpm?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  updatedAt?: string;
  createdAt?: string;
}

/** @deprecated Use SongRecord instead */
export type AirtableSongRecord = SongRecord;

export interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
  createdTime?: string;
}

export interface AirtableBrandVideoRecord {
  id: string;
  brandId: string;
  title: string;
  description?: string;
  videoUrl: string;
  status: 'Trigger' | 'Processing' | 'Done' | 'Error';
  youtubeUrl?: string;
  tags?: string[];
  channelId?: string;
  category?: string;
  thumbnailUrl?: string;
}

// ---- Pipeline Types ----

export interface PipelineStep {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

export interface PipelineRun {
  id: string;
  type: 'neural-beat' | 'brand-video';
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: PipelineStep[];
  input: any;
  output: any;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  description: string;
  status: 'active' | 'idle' | 'processing';
  tasksCompleted: number;
  avgScore: number;
  color: string;
}

export interface DashboardStats {
  totalPosts: number;
  totalEngagement: number;
  totalReach: number;
  averageViralityScore: number;
  postsThisWeek: number;
  topPlatform: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  brandId: string;
  platforms: string[];
  date: Date;
  status: string;
  color: string;
}
