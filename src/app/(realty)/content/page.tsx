import { PlatformAppPage } from "@/components/platform/platform-app-page";
import { ContentOverview } from "@/components/content/content-overview";
import { REALTYFLOW_APP_BY_ID } from "@/lib/platform-apps";

export default function Page() {
  return (
    <div className="space-y-8">
      <PlatformAppPage app={REALTYFLOW_APP_BY_ID.content} />
      <div className="mx-auto max-w-6xl">
        <ContentOverview />
      </div>
    </div>
  );
}
