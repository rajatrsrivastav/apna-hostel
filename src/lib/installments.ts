export type StudentPayment = {
  amount: number;
  installment: 1 | 2;
  installments: 1 | 2;
};

// Monthly rent has at most two payments. Keep the second payment equal to the
// actual remaining balance so a previously recorded partial payment can close it.
export function nextStudentPayment(fee: {
  outstanding: number;
  verifiedPaymentCount: number;
  rentMonth: string | null;
}): StudentPayment | null {
  if (fee.outstanding < 100) return null;
  if (!fee.rentMonth)
    return { amount: fee.outstanding, installment: 1, installments: 1 };
  if (fee.verifiedPaymentCount >= 2) return null;
  if (fee.verifiedPaymentCount === 1)
    return { amount: fee.outstanding, installment: 2, installments: 2 };

  const firstHalf = Math.ceil(fee.outstanding / 2);
  // Cashfree requires at least ₹1 per order; an unsplittable rent needs office review.
  if (firstHalf < 100 || fee.outstanding - firstHalf < 100)
    return null;
  return { amount: firstHalf, installment: 1, installments: 2 };
}
