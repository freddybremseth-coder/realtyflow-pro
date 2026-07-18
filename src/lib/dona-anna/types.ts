export type DonaAnnaWorkspace = {
  id: string;
  slug: string;
  display_name: string;
  default_currency: string;
  status: "planning" | "active" | "paused" | "archived";
};

export type DonaAnnaLegalEntity = {
  id: string;
  slug: string;
  legal_name: string;
  trading_name: string | null;
  country_code: string;
  registration_number: string | null;
  vat_number: string | null;
  default_currency: string;
  active: boolean;
};

export type DonaAnnaBillingCustomer = {
  id: string;
  organization_id: string;
  name: string;
  customer_type: string;
  country_code: string;
  currency: string;
  email: string | null;
  active: boolean;
};

export type DonaAnnaParty = {
  id: string;
  organization_id: string | null;
  billing_customer_id: string | null;
  party_type: "person" | "company";
  name: string;
  roles: string[];
  country_code: string | null;
  email: string | null;
  phone: string | null;
  default_price_list_id: string | null;
};

export type DonaAnnaProduct = {
  id: string;
  brand_id: string | null;
  owner_organization_id: string | null;
  billing_product_id: string | null;
  sku: string;
  name: string;
  description: string | null;
  product_type: "goods" | "service" | "packaging";
  unit: string;
  track_lots: boolean;
  shelf_life_days: number | null;
  barcode: string | null;
  unit_price: string | number | null;
  price_currency: string | null;
  price_list_id: string | null;
  price_list_name: string | null;
};

export type DonaAnnaPriceList = {
  id: string;
  name: string;
  code: string;
  currency: string;
  sales_channel: string;
  customer_type: string;
};

export type DonaAnnaPriceItem = {
  id: string;
  price_list_id: string;
  price_list_code: string;
  product_id: string;
  unit_price: string | number;
  minimum_quantity: string | number;
  currency: string;
  sales_channel: string;
  customer_type: string;
  valid_from: string;
  valid_to: string | null;
};

export type DonaAnnaWarehouse = {
  id: string;
  owner_organization_id: string | null;
  code: string;
  name: string;
  warehouse_type: string;
  country_code: string | null;
  status: "planned" | "active" | "paused" | "closed";
};

export type DonaAnnaLot = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  owner_organization_id: string | null;
  lot_number: string;
  status: string;
  harvest_year: number | null;
  production_date: string | null;
  bottling_date: string | null;
  best_before_date: string | null;
  origin_country_code: string | null;
  olive_variety: string | null;
  organic_status: string | null;
};

export type DonaAnnaStock = {
  workspace_id: string;
  owner_organization_id: string | null;
  warehouse_id: string;
  product_id: string;
  lot_id: string | null;
  on_hand: string | number;
  reserved: string | number;
  available: string | number;
  average_receipt_cost: string | number;
  product_name: string;
  sku: string;
  warehouse_name: string;
  lot_number: string | null;
  best_before_date: string | null;
  lot_status: string | null;
};

export type DonaAnnaOrder = {
  id: string;
  order_number: string;
  order_type: "sale" | "purchase" | "intercompany_sale" | "intercompany_purchase" | "pos";
  seller_organization_id: string | null;
  buyer_organization_id: string | null;
  party_id: string | null;
  party_name: string | null;
  sales_rep_party_id: string | null;
  sales_rep_name: string | null;
  billing_customer_id: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  destination_warehouse_id: string | null;
  pos_session_id: string | null;
  sales_channel: string;
  status: string;
  payment_status: string;
  ordered_at: string;
  currency: string;
  subtotal: string | number;
  tax_total: string | number;
  total: string | number;
  paid_amount: string | number;
  billing_document_id: string | null;
  commission_rule_id: string | null;
  notes: string | null;
};

export type DonaAnnaOrderLine = {
  id: string;
  order_id: string;
  position: number;
  product_id: string;
  product_name: string;
  sku: string;
  lot_id: string | null;
  lot_number: string | null;
  description: string;
  quantity: string | number;
  fulfilled_quantity: string | number;
  unit: string;
  unit_price: string | number;
  unit_cost: string | number;
  tax_rate: string | number;
  line_total: string | number;
};

export type DonaAnnaPosSession = {
  id: string;
  organization_id: string;
  warehouse_id: string;
  warehouse_name: string;
  session_number: string;
  status: "open" | "closed";
  opened_at: string;
  opening_cash: string | number;
  expected_cash: string | number | null;
  actual_cash: string | number | null;
  difference: string | number | null;
};

export type DonaAnnaCommissionRule = {
  id: string;
  organization_id: string | null;
  name: string;
  rule_type: "revenue_percent" | "margin_percent" | "fixed";
  percentage: string | number | null;
  fixed_amount: string | number | null;
  currency: string | null;
  payable_event: "fulfilled" | "paid";
  applies_to_channel: string;
};

export type DonaAnnaCommissionEntry = {
  id: string;
  order_id: string;
  order_number: string;
  beneficiary_name: string;
  basis_amount: string | number;
  amount: string | number;
  currency: string;
  status: string;
};

export type DonaAnnaReturn = {
  id: string;
  order_id: string | null;
  return_number: string;
  return_type: string;
  status: string;
  reason: string;
  refund_amount: string | number;
  currency: string;
  created_at: string;
};

export type DonaAnnaRecall = {
  id: string;
  recall_number: string;
  lot_id: string;
  lot_number: string;
  product_name: string;
  status: string;
  risk_level: string;
  reason: string;
  instructions: string | null;
  opened_at: string;
};

export type DonaAnnaLandedCost = {
  id: string;
  purchase_order_id: string;
  cost_type: string;
  amount: string | number;
  currency: string;
  allocation_method: string;
  document_reference: string | null;
  created_at: string;
};

export type DonaAnnaSnapshot = {
  workspace: DonaAnnaWorkspace;
  brands: Array<{ id: string; slug: string; display_name: string }>;
  legalEntities: DonaAnnaLegalEntity[];
  brandOrganizationLinks: Array<Record<string, unknown>>;
  billingCustomers: DonaAnnaBillingCustomer[];
  parties: DonaAnnaParty[];
  products: DonaAnnaProduct[];
  priceLists: DonaAnnaPriceList[];
  priceItems: DonaAnnaPriceItem[];
  warehouses: DonaAnnaWarehouse[];
  lots: DonaAnnaLot[];
  stock: DonaAnnaStock[];
  orders: DonaAnnaOrder[];
  orderLines: DonaAnnaOrderLine[];
  posSessions: DonaAnnaPosSession[];
  commissionRules: DonaAnnaCommissionRule[];
  commissionEntries: DonaAnnaCommissionEntry[];
  returns: DonaAnnaReturn[];
  recalls: DonaAnnaRecall[];
  landedCosts: DonaAnnaLandedCost[];
  metrics: {
    productCount: number;
    warehouseCount: number;
    lotCount: number;
    onHand: string | number;
    reserved: string | number;
    openOrders: number;
    openRecalls: number;
    inventoryValue: string | number;
  };
};

export type DonaAnnaCommand =
  | "upsert_product"
  | "upsert_price_list"
  | "set_price"
  | "upsert_party"
  | "upsert_warehouse"
  | "upsert_lot"
  | "adjust_inventory"
  | "create_order"
  | "order_action"
  | "pos_action"
  | "upsert_commission_rule"
  | "create_return"
  | "create_recall"
  | "record_landed_cost"
  | "link_organization"
  | "create_invoice";
