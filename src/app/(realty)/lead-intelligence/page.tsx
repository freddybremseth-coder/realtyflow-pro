import { LeadIntelligenceClient } from "@/components/lead-intelligence/lead-intelligence-client";
import {
  isLeadIntelligenceConnectExistingEnabled,
  isLeadIntelligenceEnabled,
  isLeadIntelligencePersistenceEnabled,
} from "@/services/lead-intelligence/feature-flags";

export default function LeadIntelligencePage() {
  return (
    <LeadIntelligenceClient
      featureEnabled={isLeadIntelligenceEnabled()}
      persistenceEnabled={isLeadIntelligencePersistenceEnabled()}
      connectExistingEnabled={isLeadIntelligenceConnectExistingEnabled()}
    />
  );
}
