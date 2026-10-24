import { redirect } from "next/navigation";

// Legacy workspace link now resolves to the single Altovena collaboration area.
export default function RedirectToAltovenaCollaboration() {
  redirect("/altovena/collaboration");
}
