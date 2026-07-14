import { redirect } from "next/navigation";

export default function CustomerDetailRedirect({ params }: { params: { contactId: string } }) {
  redirect(`/customers?tab=all&contactId=${encodeURIComponent(params.contactId)}`);
}
