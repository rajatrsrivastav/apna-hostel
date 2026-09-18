-- Rename payment_method enum value
ALTER TYPE payment_method RENAME VALUE 'razorpay' TO 'cashfree';

-- Rename columns
ALTER TABLE payments RENAME COLUMN razorpay_order_id TO cashfree_order_id;
ALTER TABLE payments RENAME COLUMN razorpay_payment_id TO cashfree_payment_id;

-- Recreate unique indexes with new names
DROP INDEX IF EXISTS payments_razorpay_order_id_unique;
DROP INDEX IF EXISTS payments_razorpay_payment_id_unique;
CREATE UNIQUE INDEX payments_cashfree_order_id_unique ON payments (cashfree_order_id);
CREATE UNIQUE INDEX payments_cashfree_payment_id_unique ON payments (cashfree_payment_id);
