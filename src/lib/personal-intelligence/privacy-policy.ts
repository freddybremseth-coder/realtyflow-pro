export type PersonalPrivacyLevel = "public" | "internal" | "private" | "sensitive" | "restricted";

const PRIVACY_RANK: Record<PersonalPrivacyLevel, number> = {
  public: 0,
  internal: 1,
  private: 2,
  sensitive: 3,
  restricted: 4,
};

export interface PersonalPrivacyDecisionInput {
  requestedLevel: PersonalPrivacyLevel;
  sessionScope: PersonalPrivacyLevel;
  explicitSensitivePermission?: boolean;
}

export interface PersonalPrivacyDecision {
  allow: boolean;
  reason: string;
}

export function canUsePersonalContext(input: PersonalPrivacyDecisionInput): PersonalPrivacyDecision {
  const requestedRank = PRIVACY_RANK[input.requestedLevel];
  const scopeRank = PRIVACY_RANK[input.sessionScope];

  if (requestedRank > scopeRank) {
    return {
      allow: false,
      reason: `Context level ${input.requestedLevel} exceeds session scope ${input.sessionScope}.`,
    };
  }

  if ((input.requestedLevel === "sensitive" || input.requestedLevel === "restricted") && !input.explicitSensitivePermission) {
    return {
      allow: false,
      reason: `${input.requestedLevel} context requires explicit sensitive-context permission.`,
    };
  }

  return { allow: true, reason: "Context is inside the authorized privacy scope." };
}

export function allowedPrivacyLevels(
  sessionScope: PersonalPrivacyLevel,
  explicitSensitivePermission = false,
): PersonalPrivacyLevel[] {
  return (Object.keys(PRIVACY_RANK) as PersonalPrivacyLevel[]).filter((level) =>
    canUsePersonalContext({ requestedLevel: level, sessionScope, explicitSensitivePermission }).allow,
  );
}
