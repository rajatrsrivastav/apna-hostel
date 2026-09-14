import "server-only";
import { Resend } from "resend";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail({ to, subject, html, text }: EmailPayload): Promise<{
  id?: string;
  success: boolean;
}> {
  const resend = getResendClient();
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Apna Hostel <onboarding@resend.dev>";

  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[Email Mock] To: ${to} | Subject: "${subject}" | (RESEND_API_KEY not configured)`,
      );
    }
    return { id: "mock-delivered", success: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("[Email Error] Resend returned error:", error.message);
      return { success: false };
    }

    return { id: data?.id, success: true };
  } catch (err) {
    console.error(
      "[Email Error] Failed to send email via Resend:",
      err instanceof Error ? err.message : String(err),
    );
    return { success: false };
  }
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
  <title>${title}</title>
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
              <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 6px 0; line-height: 1.3;">${title}</h1>
              <p style="font-size: 14px; color: #64748b; margin: 0 0 20px 0;">${subtitle}</p>
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
              <a href="${buttonUrl}" style="display: inline-block; background-color: #28654c; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 9999px; box-shadow: 0 2px 4px rgba(40,101,76,0.2);">${buttonText}</a>
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
      <div style="font-size: 28px; font-weight: 700; color: #0f172a; margin: 4px 0 12px 0;">${currentRentFormatted}</div>
      <div style="font-size: 13px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between;">
        <span>Previous Due / पिछला बाकी: <strong>${previousDueFormatted}</strong></span>
      </div>
      <div style="font-size: 14px; color: #0f172a; padding-top: 8px; font-weight: 600;">
        Total Outstanding / कुल बाकी: <span style="color: #28654c;">${totalDueFormatted}</span>
      </div>
    </div>
    <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
      Due Date: <strong>${dueDate}</strong>. Pay online via UPI/Card or submit manual UPI receipt.
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
      <div style="font-size: 32px; font-weight: 700; color: #047857; margin: 6px 0 12px 0;">${amountFormatted}</div>
      <div style="font-size: 13px; color: #047857;">
        Date: <strong>${paymentDate}</strong> · Status: <strong>Verified & Paid</strong>
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
      <div style="font-size: 24px; font-weight: 700; color: #b91c1c; margin: 4px 0;">${amountFormatted}</div>
      <p style="font-size: 13px; color: #7f1d1d; margin: 8px 0 0 0; line-height: 1.5;">
        ${
          isFailed
            ? "Your bank or payment method could not complete the transaction. If money was deducted, it will be refunded by your bank within 3–5 working days."
            : "You closed or cancelled the checkout session. No funds were debited."
        }
      </p>
    </div>
    <p style="font-size: 13px; color: #475569; margin-top: 14px;">
      You can retry the online payment or upload a manual UPI screenshot at your convenience.
    </p>
  `;

  const text = `
Hi ${studentName},

Your payment of ${amountFormatted} was ${type}.
No money was debited (or will be refunded by your bank if deducted).

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
      <div style="font-size: 28px; font-weight: 700; color: #b45309; margin: 4px 0 10px 0;">${totalDueFormatted}</div>
      <div style="font-size: 13px; color: #78350f;">
        Original Due Date: <strong>${dueDate}</strong>
      </div>
    </div>
    <p style="font-size: 13px; color: #475569; margin-top: 16px; line-height: 1.5;">
      Please clear your pending hostel rent to avoid administrative delays. If you have already paid via UPI QR, please upload your screenshot for office verification.
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

export function buildManualPaymentSubmittedEmail({
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
  const title = `Payment Submitted / भुगतान भेजा गया`;
  const subtitle = `Hi ${studentName}, your payment screenshot has been received and is pending verification.`;

  const contentHtml = `
    <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 16px; padding: 20px; text-align: center;">
      <div style="font-size: 14px; color: #92400e; font-weight: 500;">Amount Submitted / जमा राशि</div>
      <div style="font-size: 32px; font-weight: 700; color: #b45309; margin: 6px 0 12px 0;">${amountFormatted}</div>
      <div style="font-size: 13px; color: #78350f;">
        Date: <strong>${paymentDate}</strong> · Status: <strong>Pending Verification</strong>
      </div>
    </div>
    <p style="font-size: 13px; color: #475569; margin-top: 16px; line-height: 1.5;">
      The hostel office will verify your screenshot. Please do not pay again while verification is in progress. You will receive an email once the payment is approved or if any issue is found.
    </p>
  `;

  const text = `
Hi ${studentName},

Your payment screenshot of ${amountFormatted} on ${paymentDate} has been submitted.
Status: Pending Verification

Please do not pay again. You'll be notified once the office reviews it.
View your payment: ${receiptUrl}
`;

  return {
    subject: `Apna Hostel - Payment of ${amountFormatted} Submitted for Verification`,
    html: wrapEmailTemplate({
      title,
      subtitle,
      contentHtml,
      buttonText: "View Payment / भुगतान देखें",
      buttonUrl: receiptUrl,
    }),
    text,
  };
}

export function buildAdminNewPaymentAlert({
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
  const title = `New Payment Awaiting Verification`;
  const subtitle = `A student has uploaded a manual payment screenshot for review.`;

  const contentHtml = `
    <div style="background-color: #edf3e7; border: 1px solid #d9e4d4; border-radius: 16px; padding: 20px;">
      <div style="font-size: 13px; color: #475569; font-weight: 500;">Student</div>
      <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 4px 0 12px 0;">${studentName}</div>
      <div style="font-size: 13px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px;">
        Amount: <strong>${amountFormatted}</strong> · Date: <strong>${paymentDate}</strong>
      </div>
    </div>
    <p style="font-size: 13px; color: #475569; margin-top: 14px; line-height: 1.5;">
      Please review the screenshot and approve or reject the payment in the admin portal.
    </p>
  `;

  const text = `
New manual payment awaiting verification.

Student: ${studentName}
Amount: ${amountFormatted}
Payment Date: ${paymentDate}

Review it at: ${receiptUrl}
`;

  return {
    subject: `Apna Hostel - New Payment from ${studentName} (${amountFormatted}) Needs Review`,
    html: wrapEmailTemplate({
      title,
      subtitle,
      contentHtml,
      buttonText: "Review Payment",
      buttonUrl: receiptUrl,
    }),
    text,
  };
}

export function buildPaymentRejectedEmail({
  studentName,
  amountFormatted,
  reason,
  payUrl,
}: {
  studentName: string;
  amountFormatted: string;
  reason: string;
  payUrl: string;
}) {
  const title = `Payment Rejected / भुगतान अस्वीकार`;
  const subtitle = `Hi ${studentName}, your recent payment could not be verified.`;

  const contentHtml = `
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 16px; padding: 20px;">
      <div style="font-size: 13px; color: #991b1b; font-weight: 500;">Rejected Amount / अस्वीकृत राशि</div>
      <div style="font-size: 24px; font-weight: 700; color: #b91c1c; margin: 4px 0 12px 0;">${amountFormatted}</div>
      <div style="font-size: 13px; color: #7f1d1d; border-top: 1px dashed #fca5a5; padding-top: 12px;">
        <strong>Reason:</strong> ${reason}
      </div>
    </div>
    <p style="font-size: 13px; color: #475569; margin-top: 14px; line-height: 1.5;">
      If you believe this was a mistake, please contact the hostel office. You can submit a new screenshot or retry the online payment.
    </p>
  `;

  const text = `
Hi ${studentName},

Your payment of ${amountFormatted} has been rejected.
Reason: ${reason}

Please retry or contact the office: ${payUrl}
`;

  return {
    subject: `Apna Hostel - Payment of ${amountFormatted} Rejected`,
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
