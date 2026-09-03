import nodemailer from "nodemailer";

export interface EmailOptions {
  email: string;
  subject: string;
  message?: string;
  text?: string;
  html?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  const smtpPort = Number(process.env.SMTP_PORT) || 587;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #169bb6;">${options.subject}</h2>
      <p>Your verification code is:</p>
      <div style="background-color: #f4f4f4; padding: 12px 20px; display: inline-block; border-radius: 6px; margin: 10px 0;">
        <strong style="font-size: 24px; color: #169bb6; letter-spacing: 2px;">${options.message || ""}</strong>
      </div>
      <p style="font-size: 13px; color: #666;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"ThePetSpot Support" <${process.env.EMAIL_USER || "support@thepetspot.com"}>`,
    to: options.email,
    subject: options.subject,
    text: options.text || options.message || "Notification from ThePetSpot",
    html: options.html || defaultHtml,
  });
};

/**
 * Sends a notification email to the user when their ad submission is rejected.
 */
export const sendAdRejectionEmail = async (
  userEmail: string,
  adTitle: string,
  reason: string
): Promise<void> => {
  const subject = `Update Regarding Your Pet Ad: "${adTitle}" - Status Rejected`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #0f172a; margin: 0; font-size: 24px;">ThePetSpot</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Ad Verification Notice</p>
      </div>

      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
        <h3 style="color: #991b1b; margin: 0 0 8px 0; font-size: 16px;">Ad Submission Update: Rejected</h3>
        <p style="color: #7f1d1d; margin: 0; font-size: 14px;">
          Your listing for <strong>"${adTitle}"</strong> could not be approved for publication at this time.
        </p>
      </div>

      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <strong style="color: #334155; font-size: 14px;">Reason for Rejection:</strong>
        <p style="color: #475569; margin: 8px 0 0 0; font-size: 14px; line-height: 1.5;">
          ${reason || "The listing did not meet our pet quality guidelines or required information was missing/incomplete."}
        </p>
      </div>

      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        <strong>What should you do next?</strong><br/>
        You may log in to your ThePetSpot dashboard, review the details, update the information or photos accordingly, and resubmit your ad for review.
      </p>

      <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        &copy; ${new Date().getFullYear()} ThePetSpot. All rights reserved.<br/>
        If you have questions, please reach out to support@thepetspot.com
      </div>
    </div>
  `;

  await sendEmail({
    email: userEmail,
    subject,
    text: `Your ad for "${adTitle}" was rejected. Reason: ${reason}`,
    html,
  });
};

/**
 * Sends a notification email to the user when their ad submission is approved.
 */
export const sendAdApprovalEmail = async (
  userEmail: string,
  adTitle: string
): Promise<void> => {
  const subject = `Congratulations! Your Pet Ad: "${adTitle}" is Approved! 🎉`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #0f172a; margin: 0; font-size: 24px;">ThePetSpot</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Ad Verification Notice</p>
      </div>

      <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
        <h3 style="color: #166534; margin: 0 0 8px 0; font-size: 16px;">Ad Live on ThePetSpot!</h3>
        <p style="color: #14532d; margin: 0; font-size: 14px;">
          Great news! Your listing for <strong>"${adTitle}"</strong> has been approved by our team and is now live for buyers.
        </p>
      </div>

      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        Buyers can now view your pet listing and contact you directly. You can manage your ad or mark it as sold from your user dashboard at any time.
      </p>

      <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        &copy; ${new Date().getFullYear()} ThePetSpot. All rights reserved.
      </div>
    </div>
  `;

  await sendEmail({
    email: userEmail,
    subject,
    text: `Your ad for "${adTitle}" has been approved and is now live on ThePetSpot.`,
    html,
  });
};

export default sendEmail;