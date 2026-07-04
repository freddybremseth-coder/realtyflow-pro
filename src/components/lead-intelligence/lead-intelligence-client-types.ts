import type { ExtractedLead, PhoneLookupNormalization } from "@/services/lead-intelligence/contracts";
import type {
  LeadContactCandidatePreview,
  LeadIntelligenceCrmContextItem,
} from "@/components/lead-intelligence/lead-intelligence-contact-candidates-panel";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import type { LeadIntelligencePresentationPreview } from "@/components/lead-intelligence/presentation-preview-panel";
import type { LeadIntelligencePropertyMatch } from "@/components/lead-intelligence/property-match-display";

export interface LeadAnalysisResponse {
  ok: true;
  correlationId: string;
  result: ExtractedLead;
  meta: {
    model: string;
    promptVersion: string;
    durationMs: number;
    repaired: boolean;
    redaction: {
      phoneCount: number;
      emailCount: number;
    };
    phoneNormalization: PhoneLookupNormalization;
  };
}

export interface SafeErrorResponse {
  ok: false;
  error: {
    correlationId: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ContactCandidatesResponse {
  ok: true;
  correlationId: string;
  candidates: LeadContactCandidatePreview[];
  requiresManualSelection: boolean;
}

export interface LinkedContactPreview {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
}

export interface ReviewSaveResponse {
  ok: true;
  correlationId: string;
  result: {
    status: {
      newlySaved: boolean;
      duplicate: boolean;
      conflict: boolean;
    };
    intake: { id: string; duplicate: boolean };
    analysisRun: { id: string; duplicate: boolean };
    buyerProfile: { id: string; criterionCount: number; duplicate: boolean };
    contactCandidates: {
      recorded: number;
      selectedContactId: string | null;
      decision: "connect_existing" | "create_new" | "continue_without_contact";
      createdContact: false;
      linkedContact: boolean;
      duplicate?: boolean;
    };
  };
  sideEffects: {
    contactsCreated: false;
    contactUpdated: false;
    emailSent: false;
    propertyMatchingStarted: false;
  };
}

export interface LeadIntelligenceClientProps {
  featureEnabled: boolean;
  persistenceEnabled: boolean;
  connectExistingEnabled: boolean;
  createContactEnabled: boolean;
  propertyMatchingEnabled: boolean;
}

export interface PropertyMatchPreviewResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    discoveryMode: "explicit" | "auto";
    bestEffort: boolean;
    analyzed: number;
    matched: number;
    candidateLimit: number | null;
    missingPropertyReferences: string[];
    skippedProperties: Array<{
      propertyId: string;
      reason: "PROPERTY_BRAND_MISMATCH" | "PROPERTY_NORMALIZATION_FAILED";
    }>;
    matches: LeadIntelligencePropertyMatch[];
    sideEffects: {
      leadsCreated: false;
      contactsCreated: false;
      emailsSent: false;
      matchesPersisted: false;
      shortlistCreated: false;
    };
  };
}

export interface ShortlistSaveResponse {
  ok: true;
  correlationId: string;
  result: {
    shortlistId: string;
    duplicate: boolean;
    conflict: boolean;
    itemCount: number;
    sideEffects: {
      leadsCreated: false;
      contactsCreated: false;
      emailsSent: false;
      propertyMatchingStarted: false;
      presentationCreated: false;
    };
  };
}

export interface PresentationDraftResponse {
  ok: true;
  correlationId: string;
  result: {
    presentationId: string;
    buyerProfileId: string;
    shortlistId: string;
    messageDraftId: string;
    duplicate: boolean;
    conflict: boolean;
    loadedFromHistory?: boolean;
    status: "draft" | "approved" | "archived";
    messageStatus: "draft" | "approved" | "cancelled";
    itemCount: number;
    title: string;
    subject: string;
    presentationPreview: LeadIntelligencePresentationPreview;
    messageDraft: {
      subject: string;
      bodyText: string;
      bodyHtml: string | null;
    };
    sideEffects: {
      emailSent: false;
      leadsCreated: false;
      contactsCreated: false;
      propertyMatchingStarted: false;
      presentationPublished: false;
    };
  };
}

export interface PresentationDraftHistoryResponse {
  ok: true;
  correlationId: string;
  result: {
    brand: string;
    buyerProfileId: string;
    limit: number;
    items: Array<{
      presentationId: string;
      shortlistId: string;
      messageDraftId: string;
      status: "draft" | "approved" | "archived";
      messageStatus: "draft" | "approved" | "cancelled";
      title: string;
      subject: string;
      itemCount: number;
      createdAt: string;
      messageDraftCreatedAt: string;
    }>;
  };
}

export interface LeadIntelligenceWorklistResponse {
  ok: true;
  correlationId: string;
  result: {
    brand: string;
    limit: number;
    items: LeadIntelligenceWorklistItem[];
  };
}

export interface LeadIntelligenceCrmContextResponse {
  ok: true;
  correlationId: string;
  result: {
    candidates: LeadContactCandidatePreview[];
    context: LeadIntelligenceCrmContextItem[];
  };
  sideEffects: {
    contactsCreated: false;
    contactsUpdated: false;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
  };
}

export interface SavedProfileContactCandidatesResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    linkedContact: LinkedContactPreview | null;
    candidates: LeadContactCandidatePreview[];
    requiresManualSelection: boolean;
  };
  sideEffects: {
    contactsCreated: false;
    contactsUpdated: false;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
  };
}

export interface SavedProfileContactLinkResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    contactId: string;
    duplicate: boolean;
    linkedContact: LinkedContactPreview;
  };
  sideEffects: {
    contactsCreated: false;
    contactsUpdated: false;
    buyerProfileUpdated: true;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
  };
}

export interface SavedProfileContactCreateResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    contactId: string;
    duplicate: boolean;
    linkedContact: LinkedContactPreview;
  };
  sideEffects: {
    contactsCreated: boolean;
    contactsUpdated: false;
    buyerProfileUpdated: boolean;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
    presentationCreated: false;
  };
}

export interface SavedProfileArchiveResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    status: "archived";
    duplicate: boolean;
    archived: true;
  };
  sideEffects: {
    profileArchived: true;
    contactsCreated: false;
    contactsUpdated: false;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
    presentationCreated: false;
  };
}
