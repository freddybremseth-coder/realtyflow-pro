import { redirect } from "next/navigation";

export default function AdvisorPlaybooksPage() {
  redirect("/reports?tab=ekspertinnhold");
}
