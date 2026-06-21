import { LeadIntelligenceClient } from "@/components/lead-intelligence/lead-intelligence-client";
import {
  isLeadIntelligenceConnectExistingEnabled,
  isLeadIntelligenceEnabled,
} from "@/services/lead-intelligence/feature-flags";

export default function LeadIntelligencePage() {
  return (
    <LeadIntelligenceClient
      featureEnabled={isLeadIntelligenceEnabled()}
      connectExistingEnabled={isLeadIntelligenceConnectExistingEnabled()}
    />
  );
}
