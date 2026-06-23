import { LeadIntelligenceClient } from "@/components/lead-intelligence/lead-intelligence-client";
import {
  isLeadIntelligenceConnectExistingEnabled,
  isLeadIntelligenceCreateContactEnabled,
  isLeadIntelligenceEnabled,
  isLeadIntelligencePersistenceEnabled,
  isLeadIntelligencePropertyMatchingEnabled,
} from "@/services/lead-intelligence/feature-flags";

export default function LeadIntelligencePage() {
  return (
    <LeadIntelligenceClient
      featureEnabled={isLeadIntelligenceEnabled()}
      persistenceEnabled={isLeadIntelligencePersistenceEnabled()}
      connectExistingEnabled={isLeadIntelligenceConnectExistingEnabled()}
      createContactEnabled={isLeadIntelligenceCreateContactEnabled()}
      propertyMatchingEnabled={isLeadIntelligencePropertyMatchingEnabled()}
    />
  );
}
