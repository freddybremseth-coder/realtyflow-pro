import { BuyerProfileRequirementsPanel } from "@/components/lead-intelligence/buyer-profile-requirements-panel";
import { BuyerProfileRevisionPanel } from "@/components/lead-intelligence/buyer-profile-revision-panel";
import { LeadIntelligenceClient } from "@/components/lead-intelligence/lead-intelligence-client";
import { LeadIntelligenceContinueBridge } from "@/components/lead-intelligence/lead-intelligence-continue-bridge";
import {
  isLeadIntelligenceConnectExistingEnabled,
  isLeadIntelligenceCreateContactEnabled,
  isLeadIntelligenceEnabled,
  isLeadIntelligencePersistenceEnabled,
  isLeadIntelligencePropertyMatchingEnabled,
} from "@/services/lead-intelligence/feature-flags";

export default function LeadIntelligencePage() {
  const featureEnabled = isLeadIntelligenceEnabled();
  const persistenceEnabled = isLeadIntelligencePersistenceEnabled();
  const propertyMatchingEnabled = isLeadIntelligencePropertyMatchingEnabled();

  return (
    <div className="space-y-6">
      <LeadIntelligenceContinueBridge
        featureEnabled={featureEnabled}
        persistenceEnabled={persistenceEnabled}
      />
      <BuyerProfileRevisionPanel
        featureEnabled={featureEnabled}
        persistenceEnabled={persistenceEnabled}
        propertyMatchingEnabled={propertyMatchingEnabled}
      />
      <BuyerProfileRequirementsPanel
        featureEnabled={featureEnabled}
        persistenceEnabled={persistenceEnabled}
        propertyMatchingEnabled={propertyMatchingEnabled}
      />
      <LeadIntelligenceClient
        featureEnabled={featureEnabled}
        persistenceEnabled={persistenceEnabled}
        connectExistingEnabled={isLeadIntelligenceConnectExistingEnabled()}
        createContactEnabled={isLeadIntelligenceCreateContactEnabled()}
        propertyMatchingEnabled={propertyMatchingEnabled}
      />
    </div>
  );
}
