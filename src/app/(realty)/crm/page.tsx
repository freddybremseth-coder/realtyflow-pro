import { redirect } from "next/navigation";

export default function LegacyCrmRedirect() {
  redirect("/customers?tab=all");
}
