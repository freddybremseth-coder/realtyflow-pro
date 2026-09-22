"use client";

import Link from "next/link";

type Customer360LinkProps = {
  contactId?: unknown;
  name?: unknown;
  className?: string;
};

/** Only link to a verified contact ID surfaced by the authorized task API.
 * Never interpret an email-message, property or work-item ID as a customer. */
export function Customer360Link({ contactId, name, className }: Customer360LinkProps) {
  const id = typeof contactId === "string" ? contactId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const label = typeof name === "string" && name.trim() ? name.trim() : "Åpne kundekort 360";
  return (
    <Link
      href={`/customers?tab=all&contactId=${encodeURIComponent(id)}`}
      aria-label={`Åpne kundekort 360 for ${label}`}
      className={className || "font-semibold text-cyan-600 underline underline-offset-2 hover:text-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"}
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.stopPropagation()}
    >
      {label}
    </Link>
  );
}

export function CustomerTaskTitle({ title, contactId, customerName }: {
  title: string;
  contactId?: unknown;
  customerName?: unknown;
}) {
  const name = typeof customerName === "string" ? customerName.trim() : "";
  const hasContact = typeof contactId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId);
  if (!hasContact || !name) return <>{title}</>;
  const index = title.toLocaleLowerCase("nb-NO").indexOf(name.toLocaleLowerCase("nb-NO"));
  if (index < 0) return <>{title}{contactId && name ? <> · <Customer360Link contactId={contactId} name={name} /></> : null}</>;
  return <>
    {title.slice(0, index)}
    <Customer360Link contactId={contactId} name={title.slice(index, index + name.length)} />
    {title.slice(index + name.length)}
  </>;
}
