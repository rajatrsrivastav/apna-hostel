import "server-only";
import { Resend } from "resend";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: EmailPayload): Promise<{
  id?: string;
  success: boolean;
}> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    console.error("[Email] RESEND_API_KEY and RESEND_FROM_EMAIL are required.");
    return { success: false };
  }
  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("[Email] Provider rejected delivery.");
      return { success: false };
    }

    return { id: data?.id, success: Boolean(data?.id) };
  } catch (err) {
    console.error(
      "[Email Error] Failed to send email via Resend:",
      err instanceof Error ? err.name : "UnknownError",
    );
    return { success: false };
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

// Reusable email wrapper with Apna Hostel branding
function wrapEmailTemplate({
  title,
  subtitle,
  contentHtml,
  buttonText,
  buttonUrl,
}: {
  title: string;
  subtitle: string;
  contentHtml: string;
  buttonText?: string;
  buttonUrl?: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f6f8f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 1px solid #f1f5f9;">
              <div style="font-size: 20px; font-weight: 700; color: #28654c; letter-spacing: -0.5px;">apnahostel<span style="color: #c48b4c;">.</span></div>
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-top: 2px;">A little more like home</div>
            </td>
          </tr>
          <!-- Body Title -->
          <tr>
            <td style="padding-top: 24px;">
              <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 6px 0; line-height: 1.3;">${escapeHtml(title)}</h1>
              <p style="font-size: 14px; color: #64748b; margin: 0 0 20px 0;">${escapeHtml(subtitle)}</p>
            </td>
          </tr>
          <!-- Content Card -->
          <tr>
            <td>
              ${contentHtml}
            </td>
          </tr>
          <!-- Action Button -->
          ${
            buttonText && buttonUrl
              ? `
          <tr>
            <td align="center" style="padding-top: 28px; padding-bottom: 12px;">
              <a href="${escapeHtml(buttonUrl)}" style="display: inline-block; background-color: #28654c; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 9999px; box-shadow: 0 2px 4px rgba(40,101,76,0.2);">${escapeHtml(buttonText)}</a>
            </td>
          </tr>
          `
              : ""
          }
          <!-- Footer -->
          <tr>
            <td style="padding-top: 24px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8;">
              <p style="margin: 0;">Apna Hostel Portal · Safe Payments & Digital Receipts</p>
              <p style="margin: 4px 0 0 0;">Need assistance? Visit student help in your portal.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export function buildRentGeneratedEmail({
  studentName,
  currentRentFormatted,
  previousDueFormatted,
  totalDueFormatted,
  dueDate,
  payUrl,
}: {
  studentName: string;
  currentRentFormatted: string;
  previousDueFormatted: string;
  totalDueFormatted: string;
  dueDate: string;
  payUrl: string;
}) {
  const title = `Hostel Rent Generated / किराया जारी किया गया`;
  const subtitle = `Hi ${studentName}, your monthly hostel fee is ready for payment.`;

  const contentHtml = `
    <div style="background-color: #edf3e7; border: 1px solid #d9e4d4; border-radius: 16px; padding: 20px; margin-bottom: 8px;">
      <div style="font-size: 13px; color: #475569; font-weight: 500;">Current Month Rent / इस महीने का किराया</div>
      <div style="font-size: 28px; font-weight: 700; color: #0f172a; margin: 4px 0 12px 0;">${escapeHtml(currentRentFormatted)}</div>
      <div style="font-size: 13px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between;">
        <span>Previous Due / पिछला बाकी: <strong>${escapeHtml(previousDueFormatted)}</strong></span>
      </div>
      <div style="font-size: 14px; color: #0f172a; padding-top: 8px; font-weight: 600;">
        Total Outstanding / कुल बाकी: <span style="color: #28654c;">${escapeHtml(totalDueFormatted)}</span>
      </div>
    </div>
    <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
      Due Date: <strong>${escapeHtml(dueDate)}</strong>. Pay online securely via Cashfree.
    </div>
  `;

  const text = `
Hi ${studentName},

Your hostel rent has been generated.
Current Month Rent: ${currentRentFormatted}
Previous Due: ${previousDueFormatted}
Total Due: ${totalDueFormatted}
Due Date: ${dueDate}

Pay now at: ${payUrl}
`;

  return {
    subject: `Apna Hostel - Rent of ${currentRentFormatted} Generated (Total Due: ${totalDueFormatted})`,
    html: wrapEmailTemplate({
      title,
      subtitle,
      contentHtml,
      buttonText: "Pay Now / फीस भरें",
      buttonUrl: payUrl,
    }),
    text,
  };
}

export function buildPaymentSuccessEmail({
  studentName,
  amountFormatted,
  paymentDate,
  receiptUrl,
}: {
  studentName: string;
  amountFormatted: string;
  paymentDate: string;
  receiptUrl: string;
}) {
  const title = `Payment Successful / भुगतान सफल रहा`;
  const subtitle = `Hi ${studentName}, we have received and confirmed your payment.`;

  const contentHtml = `
    <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 16px; padding: 20px; text-align: center;">
      <div style="font-size: 14px; color: #065f46; font-weight: 500;">Amount Received / प्राप्त राशि</div>
      <div style="font-size: 32px; font-weight: 700; color: #047857; margin: 6px 0 12px 0;">${escapeHtml(amountFormatted)}</div>
      <div style="font-size: 13px; color: #047857;">
        Date: <strong>${escapeHtml(paymentDate)}</strong> · Status: <strong>Verified & Paid</strong>
      </div>
    </div>
    <p style="font-size: 13px; color: #475569; margin-top: 16px; line-height: 1.5;">
      Your payment has been reconciled in the hostel ledger. You can view or download your official digital payment receipt anytime.
    </p>
  `;

  const text = `
Hi ${studentName},

Payment of ${amountFormatted} was received on ${paymentDate}.
Status: Verified & Paid

View your receipt: ${receiptUrl}
`;

  return {
    subject: `Apna Hostel - Payment of ${amountFormatted} Confirmed`,
    html: wrapEmailTemplate({
      title,
      subtitle,
      contentHtml,
      buttonText: "View Receipt / रसीद देखें",
      buttonUrl: receiptUrl,
    }),
    text,
  };
}

export function buildPaymentIncompleteEmail({
  studentName,
  amountFormatted,
  type,
  payUrl,
}: {
  studentName: string;
  amountFormatted: string;
  type: "failed" | "cancelled";
  payUrl: string;
}) {
  const isFailed = type === "failed";
  const title = isFailed
    ? `Payment Failed / भुगतान पूरा नहीं हुआ`
    : `Payment Cancelled / भुगतान रद्द हुआ`;
  const subtitle = `Hi ${studentName}, your recent online checkout was ${isFailed ? "declined" : "cancelled"}.`;

  const contentHtml = `
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 16px; padding: 20px;">
      <div style="font-size: 13px; color: #991b1b; font-weight: 500;">Attempted Amount</div>
      <div style="font-size: 24px; font-weight: 700; color: #b91c1c; margin: 4px 0;">${escapeHtml(amountFormatted)}</div>
      <p style="font-size: 13px; color: #7f1d1d; margin: 8px 0 0 0; line-height: 1.5;">
        ${
          isFailed
            ? "Your bank or payment method could not complete the transaction. If money was deducted, it will be refunded by your bank within 3–5 working days."
            : "The checkout was closed or cancelled. Check its status before trying again."
        }
      </p>
    </div>
    <p style="font-size: 13px; color: #475569; margin-top: 14px;">
      Check the payment status before trying again. If your account was debited, do not pay again yet.
    </p>
  `;

  const text = `
Hi ${studentName},

Your payment of ${amountFormatted} was ${type}.
If your account was debited, do not pay again until its status is checked.

You can retry your payment at: ${payUrl}
`;

  return {
    subject: `Apna Hostel - Payment ${isFailed ? "Failed" : "Cancelled"} (${amountFormatted})`,
    html: wrapEmailTemplate({
      title,
      subtitle,
      contentHtml,
      buttonText: "Retry Payment / फिर कोशिश करें",
      buttonUrl: payUrl,
    }),
    text,
  };
}

export function buildOverdueReminderEmail({
  studentName,
  totalDueFormatted,
  dueDate,
  payUrl,
}: {
  studentName: string;
  totalDueFormatted: string;
  dueDate: string;
  payUrl: string;
}) {
  const title = `Hostel Rent Overdue / बकाया फीस की सूचना`;
  const subtitle = `Hi ${studentName}, your hostel fee of ${totalDueFormatted} was due on ${dueDate}.`;

  const contentHtml = `
    <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 16px; padding: 20px;">
      <div style="font-size: 13px; color: #92400e; font-weight: 500;">Total Outstanding / कुल बकाया राशि</div>
      <div style="font-size: 28px; font-weight: 700; color: #b45309; margin: 4px 0 10px 0;">${escapeHtml(totalDueFormatted)}</div>
      <div style="font-size: 13px; color: #78350f;">
        Original Due Date: <strong>${escapeHtml(dueDate)}</strong>
      </div>
    </div>
    <p style="font-size: 13px; color: #475569; margin-top: 16px; line-height: 1.5;">
      Please clear your pending hostel rent to avoid administrative delays. If you have already paid, check its status in Payments before trying again.
    </p>
  `;

  const text = `
Hi ${studentName},

Friendly reminder: Your hostel rent of ${totalDueFormatted} was due on ${dueDate} and is currently overdue.

Please clear your dues at: ${payUrl}
`;

  return {
    subject: `Apna Hostel - Overdue Reminder: ${totalDueFormatted} pending`,
    html: wrapEmailTemplate({
      title,
      subtitle,
      contentHtml,
      buttonText: "Pay Now / फीस भरें",
      buttonUrl: payUrl,
    }),
    text,
  };
}

export function buildStudentApprovedEmail({
  studentName,
  dashboardUrl,
}: {
  studentName: string;
  dashboardUrl: string;
}) {
  const title = `Your entry has been approved ✅`;
  const subtitle = `Hi ${studentName}, your entry has been approved by the admin.`;

  const contentHtml = `
    <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 16px; padding: 20px; text-align: center;">
      <div style="font-size: 18px; font-weight: 700; color: #047857; margin: 6px 0 12px 0;">Welcome to Apna Hostel!</div>
      <p style="font-size: 14px; color: #065f46; margin: 0; line-height: 1.5;">
        You can now open your dashboard and manage your monthly rent payments.
      </p>
    </div>
  `;

  const text = `
Hi ${studentName},

Your entry has been approved by the admin.
You can now open your dashboard and manage your monthly rent payments.

Open Dashboard: ${dashboardUrl}
`;

  return {
    subject: title,
    html: wrapEmailTemplate({
      title,
      subtitle,
      contentHtml,
      buttonText: "Open Dashboard",
      buttonUrl: dashboardUrl,
    }),
    text,
  };
}
