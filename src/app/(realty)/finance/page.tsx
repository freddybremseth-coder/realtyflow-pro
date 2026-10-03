import { PlatformAppPage } from "@/components/platform/platform-app-page";
import { FinanceOverview } from "@/components/finance/finance-overview";
import { REALTYFLOW_APP_BY_ID } from "@/lib/platform-apps";

export default function Page() {
  return (
    <div className="space-y-8">
      <PlatformAppPage app={REALTYFLOW_APP_BY_ID.finance} />
      <div className="mx-auto max-w-6xl">
        <FinanceOverview />
      </div>
    </div>
  );
}
