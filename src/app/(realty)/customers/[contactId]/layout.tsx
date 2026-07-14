import type { ReactNode } from "react";
import { CustomerUpdatePanel } from "@/components/customers/customer-update-panel";

export default function CustomerDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { contactId: string };
}) {
  return (
    <>
      <CustomerUpdatePanel contactId={params.contactId} />
      {children}
    </>
  );
}
