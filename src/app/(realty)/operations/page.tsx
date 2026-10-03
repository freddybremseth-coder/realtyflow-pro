import { PlatformAppPage } from "@/components/platform/platform-app-page";
import { REALTYFLOW_APP_BY_ID } from "@/lib/platform-apps";

export default function Page() {
  return <PlatformAppPage app={REALTYFLOW_APP_BY_ID.operations} />;
}
