import { z } from "zod";
export const idSchema = z.string().min(1).max(128);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Choose a valid date.",
  );
export const amountSchema = z
  .string()
  .regex(
    /^\d{1,6}(\.\d{1,2})?$/,
    "Enter a valid amount, up to 2 decimal places.",
  )
  .transform((v) => Math.round(Number(v) * 100))
  .pipe(
    z
      .number()
      .int()
      .min(100, "Minimum amount is ₹1.")
      .max(10000000, "Maximum amount is ₹1,00,000."),
  );
export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number."),
  course: z.enum(["ITI", "Diploma"]),
  trade: z.string().trim().min(2, "Enter your branch or trade.").max(80),
  studyYear: z.string().trim().min(1, "Choose your year or semester.").max(30),
});
export const feeSchema = z.object({
  userId: idSchema,
  label: z.string().trim().min(2).max(80),
  amount: amountSchema,
  dueDate: dateSchema,
});
export function todayIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}
