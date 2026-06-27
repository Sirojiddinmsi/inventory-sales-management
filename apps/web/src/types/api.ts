export type UserRole = "ADMIN" | "SELLER";
export type PaymentType = "CASH" | "CARD" | "DEBT";
export type DebtPaymentMethod = "CASH" | "CARD" | "TRANSFER" | "MIXED";
export type FinancePaymentMethod = PaymentType | DebtPaymentMethod;
export type DebtStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  profile_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type Paginated<T> = {
  data: T[];
  meta: PaginationMeta;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type MeasurementUnit = {
  id: string;
  name: string;
  created_at: string;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  category_id: string;
  category_name: string;
  brand: string | null;
  unit: string;
  purchase_price: number;
  sale_price: number;
  next_fifo_cost?: number;
  last_sale_price?: number | null;
  stock_quantity: number;
  minimum_stock: number;
  location: string | null;
  image_url: string | null;
  image_urls: string[];
  description: string | null;
  is_active: boolean;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
};

export type Purchase = {
  id: string;
  purchase_document_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  product_id: string;
  product_name: string;
  product_code: string;
  unit: string;
  product_location: string | null;
  quantity: number;
  purchase_price: number;
  total_cost: number;
  purchased_at: string;
  note: string | null;
  created_by_name: string;
  updated_by_name?: string | null;
  updated_at?: string | null;
};

export type PurchaseDocument = {
  id: string;
  document_number: string;
  purchased_at: string;
  created_at: string;
  created_by: string;
  created_by_name: string;
  supplier_name: string | null;
  supplier_count: number;
  line_count: number;
  total_quantity: number;
  total_amount: number;
  items: Purchase[];
};

export type SupplierReturn = {
  id: string;
  supplier_return_document_id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  unit: string;
  quantity: number;
  fifo_cost: number;
  agreed_return_price_per_unit: number;
  total_agreed_return_amount: number;
  supplier_return_profit: number;
  returned_at: string;
  note: string | null;
  created_by_name: string;
  created_at: string;
};

export type SupplierReturnDocument = {
  id: string;
  document_number: string;
  returned_at: string;
  note: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  line_count: number;
  total_quantity: number;
  total_fifo_cost: number;
  total_agreed_return_amount: number;
  total_supplier_return_profit: number;
  items: SupplierReturn[];
};

export type ProductMovementType = "arrival" | "sale" | "return" | "supplier_return" | "adjustment";

export type ProductHistory = {
  product: Product;
  summary: {
    current_stock: number;
    remaining_stock_value: number;
  };
  batches: Array<{
    id: string;
    source: string;
    initial_quantity: number;
    remaining_quantity: number;
    purchase_price: number;
    received_at: string;
    purchase_id: string | null;
    note: string | null;
    supplier_name: string | null;
    location: string | null;
  }>;
  arrivals: Array<{
    movement_type: "arrival";
    movement_at: string;
    quantity: number;
    purchase_price: number;
    total_amount: number;
    partner_name: string | null;
    location: string | null;
    remaining_quantity: number | null;
    reference_number: string;
    note: string | null;
  }>;
  sales: Array<{
    movement_type: "sale";
    movement_at: string;
    quantity: number;
    sale_price: number;
    total_amount: number;
    fifo_cost: number;
    profit: number;
    reference_number: string;
    partner_name: string | null;
    note: string | null;
  }>;
  returns: Array<{
    movement_type: "return";
    movement_at: string;
    quantity: number;
    total_amount: number;
    fifo_cost: number;
    profit: number;
    reference_number: string;
    partner_name: string | null;
    note: string | null;
  }>;
  supplier_returns: Array<{
    movement_type: "supplier_return";
    movement_at: string;
    quantity: number;
    sale_price: number;
    total_amount: number;
    fifo_cost: number;
    profit: number;
    reference_number: string;
    partner_name: null;
    note: string | null;
  }>;
  adjustments: Array<{
    movement_type: "adjustment";
    movement_at: string;
    quantity: number;
    purchase_price: number;
    total_amount: number;
    location: string | null;
    remaining_quantity: number;
    reference_number: string;
    note: string | null;
  }>;
  movements: Array<{
    movement_type: ProductMovementType;
    movement_at: string;
    quantity: number;
    purchase_price?: number;
    sale_price?: number;
    total_amount: number;
    fifo_cost?: number;
    profit?: number;
    partner_name?: string | null;
    location?: string | null;
    remaining_quantity?: number | null;
    reference_number: string;
    note?: string | null;
  }>;
};

export type Sale = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  returned_amount: number;
  net_total_amount: number;
  fifo_cost: number;
  returned_fifo_cost: number;
  payment_type: PaymentType;
  debt_id?: string | null;
  debt_status?: DebtStatus | null;
  debt_paid_amount?: number | null;
  debt_remaining_amount?: number | null;
  profit: number;
  returned_profit: number;
  net_profit: number;
  sold_at: string;
  note: string | null;
  seller_name?: string;
  archived_at: string | null;
  archive_reason: string | null;
  archive_expires_at: string | null;
  created_at?: string;
};

export type SaleItem = {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  base_unit: string;
  unit: string;
  quantity: number;
  sale_quantity: number;
  returned_quantity: number;
  returned_sale_quantity: number;
  remaining_quantity: number;
  remaining_sale_quantity: number;
  unit_multiplier: number;
  sale_price: number;
  discount: number;
  total_amount: number;
  fifo_cost: number;
  returned_fifo_cost: number;
  profit: number;
};

export type SaleDetails = Sale & {
  customer_phone: string | null;
  due_date?: string | null;
  items: SaleItem[];
  returns: Array<{
    id: string;
    sale_item_id: string;
    product_id: string;
    product_code: string;
    product_name: string;
    quantity: number;
    amount: number;
    reason: string;
    returned_at: string;
    created_by_name: string;
  }>;
};

export type Debt = {
  id: string;
  sale_id: string;
  invoice_number: string;
  customer_name: string;
  phone: string | null;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: DebtStatus;
  due_date: string | null;
  note: string | null;
  created_at: string;
  archived_at: string | null;
  archive_reason: string | null;
  archive_expires_at: string | null;
};

export type DebtPayment = {
  id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  received_by_name: string;
  payment_method: DebtPaymentMethod;
  cash_amount: number;
  card_amount: number;
  transfer_amount: number;
};

export type DebtSummary = {
  total_active_debt: number;
  paid_debts: number;
  overdue_debts: number;
  partially_paid_debts: number;
};

export type Expense = {
  id: string;
  expense_type: string;
  amount: number;
  spent_at: string;
  note: string | null;
  created_by_name: string;
};

export type Settings = {
  id: number;
  shop_name: string;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  updated_at: string;
};

export type DashboardData = {
  today_sales: number;
  today_profit: number;
  week_sales: number;
  week_fifo_cost: number;
  week_profit: number;
  amount_to_submit: number;
  total_stock_quantity: number;
  low_stock_count: number;
  outstanding_debt: number;
  today_expenses: number;
  payment_stats: Array<{
    payment_type: FinancePaymentMethod;
    amount: number;
    sale_count: number;
  }>;
  low_stock_products: Product[];
};

export type ReportData = {
  summary: {
    sale_count: number;
    products_sold_count: number;
    units_sold: number;
    total_sales: number;
    total_fifo_cost: number;
    supplier_return_profit: number;
    amount_to_submit: number;
    total_profit: number;
    average_sale: number;
    total_expenses: number;
    net_profit: number;
  };
  daily: Array<{
    date: string;
    sale_count: number;
    total_sales: number;
    fifo_cost: number;
    profit: number;
  }>;
  by_product: Array<{
    product_id: string;
    code: string;
    name: string;
    quantity: number;
    total_sales: number;
    fifo_cost: number;
    profit: number;
  }>;
  by_category: Array<{
    category_id: string;
    name: string;
    quantity: number;
    total_sales: number;
    fifo_cost: number;
    profit: number;
  }>;
  by_payment_type: Array<{
    payment_type: FinancePaymentMethod;
    sale_count: number;
    total_sales: number;
    profit: number;
  }>;
  debt_payments: Array<{
    payment_method: DebtPaymentMethod;
    payment_count: number;
    total_amount: number;
  }>;
  expenses: Array<{
    expense_type: string;
    expense_count: number;
    amount: number;
  }>;
  supplier_returns: Array<{
    id: string;
    product_id: string;
    code: string;
    name: string;
    unit: string;
    quantity: number;
    fifo_cost: number;
    agreed_return_price_per_unit: number;
    total_agreed_return_amount: number;
    supplier_return_profit: number;
    returned_at: string;
    note: string | null;
  }>;
};
