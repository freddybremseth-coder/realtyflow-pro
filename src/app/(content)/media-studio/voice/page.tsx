import { OpenArtVoiceBridgePanel } from "@/components/media-studio/openart-voice-bridge-panel";
import { VoiceStudioProClient } from "@/components/media-studio/voice-studio-pro-client";

export default function VoiceStudioProPage() {
  return (
    <div className="space-y-6">
      <VoiceStudioProClient />
      <OpenArtVoiceBridgePanel />
    </div>
  );
}
