import { BillingDocumentEditor } from "@/components/billing/billing-document-editor";

export const metadata = { title: "Dokument | Fakturering" };

export default function BillingDocumentPage({ params }: { params: { id: string } }) {
  return <BillingDocumentEditor initialDocumentId={params.id} />;
}
