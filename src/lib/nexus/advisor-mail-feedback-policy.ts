export const ADVISOR_MAIL_FEEDBACK_POLICY = {
  treatInterestedAsWarmSignal: true,
  treatNotForMeAsPreferenceSignal: true,
  inferNegativeReasonWithoutExplicitFeedback: false,
  autonomousFollowupFromSingleClick: false,
} as const;
