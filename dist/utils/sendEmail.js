import nodemailer from "nodemailer";
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
export const sendEmail = async (options) => {
    await transporter.sendMail({
        from: `"PetSpot Support" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        text: `Your OTP verification code is: ${options.message}`,
        html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #169bb6;">PetSpot Verification</h2>
        <p>Your verification code is:</p>
        <div style="background-color: #f4f4f4; padding: 12px 20px; display: inline-block; border-radius: 6px; margin: 10px 0;">
          <strong style="font-size: 24px; color: #169bb6; letter-spacing: 2px;">${options.message}</strong>
        </div>
        <p style="font-size: 13px; color: #666;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `,
    });
};
export default sendEmail;
//# sourceMappingURL=sendEmail.js.map