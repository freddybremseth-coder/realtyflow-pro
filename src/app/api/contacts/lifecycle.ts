import {
  CUSTOMER_PIPELINE_STATUSES,
  normalizeCustomerPipelineStatus,
  type CustomerPipelineStatus,
} from '@/lib/customer-updates';

const PIPELINE_VIEW_STATUSES = new Set<CustomerPipelineStatus>(CUSTOMER_PIPELINE_STATUSES);
const CRM_VIEW_STATUSES = new Set<CustomerPipelineStatus>([
  'CONTACT',
  'QUALIFIED',
  'MATCHING',
  'VIEWING',
  'NEGOTIATION',
  'RESERVED',
  'ON_HOLD',
  'WON',
  'LOST',
]);

export function normalizeContactForClient(contact: any) {
  if (!contact || typeof contact !== 'object') return contact;
  const pipelineStatus = normalizeCustomerPipelineStatus(contact.pipeline_status || contact.status || contact.stage);
  const normalized = {
    ...contact,
    pipeline_status: pipelineStatus,
  };
  if (pipelineStatus !== 'WON') return normalized;
  return {
    ...normalized,
    sentiment: contact.sentiment && String(contact.sentiment).toLowerCase() !== 'neutral' ? contact.sentiment : 'hot',
    buying_signal_score: Number(contact.buying_signal_score || contact.purchase_signal_score || 100),
    purchase_signal_score: Number(contact.purchase_signal_score || contact.buying_signal_score || 100),
  };
}

export function normalizeIncomingContact(contact: any, options: { defaultPipelineStatus?: boolean } = {}) {
  const next = { ...(contact || {}) };
  const hasPipelineStatus = next.pipeline_status !== undefined || next.status !== undefined || next.stage !== undefined;
  const incomingStatus = next.pipeline_status ?? next.status ?? next.stage;

  delete next.status;
  delete next.stage;

  if (hasPipelineStatus || options.defaultPipelineStatus) {
    next.pipeline_status = normalizeCustomerPipelineStatus(incomingStatus ?? 'NEW');
  } else {
    delete next.pipeline_status;
  }

  if (typeof next.email === 'string') next.email = next.email.trim();
  if (typeof next.phone === 'string') next.phone = next.phone.trim();

  if (next.pipeline_status === 'WON') {
    next.sentiment = 'hot';
    next.buying_signal_score = 100;
    next.purchase_signal_score = 100;
    if (!next.pipeline_value && next.sale_price) next.pipeline_value = next.sale_price;
  }
  return next;
}

export function filterContactsByView(contacts: any[], view: string | null) {
  if (view !== 'pipeline' && view !== 'crm') return contacts;
  const allowed = view === 'pipeline' ? PIPELINE_VIEW_STATUSES : CRM_VIEW_STATUSES;
  return contacts.filter((contact) => allowed.has(normalizeCustomerPipelineStatus(contact?.pipeline_status)));
}
