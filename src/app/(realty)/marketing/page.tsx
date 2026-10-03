import { PlatformAppPage } from "@/components/platform/platform-app-page";
import { MarketingOverview } from "@/components/marketing/marketing-overview";
import { REALTYFLOW_APP_BY_ID } from "@/lib/platform-apps";

export default function Page() {
  return (
    <div className="space-y-8">
      <PlatformAppPage app={REALTYFLOW_APP_BY_ID.marketing} />
      <div className="mx-auto max-w-6xl">
        <MarketingOverview />
      </div>
    </div>
  );
}
