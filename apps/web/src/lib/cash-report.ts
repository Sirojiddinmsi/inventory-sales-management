type SalePaymentSummary = {
  payment_type: string;
  total_sales: number;
};

type DebtPaymentSummary = {
  total_amount: number;
};

export function calculateCashReport(
  salePayments: SalePaymentSummary[],
  debtPayments: DebtPaymentSummary[]
) {
  const saleCollections = salePayments.reduce(
    (total, item) => item.payment_type === "DEBT" ? total : total + Number(item.total_sales),
    0
  );
  const debtCollections = debtPayments.reduce(
    (total, item) => total + Number(item.total_amount),
    0
  );
  const creditSales = salePayments.find((item) => item.payment_type === "DEBT");

  return {
    saleCollections,
    debtCollections,
    totalCollections: saleCollections + debtCollections,
    creditSales: Number(creditSales?.total_sales ?? 0)
  };
}
