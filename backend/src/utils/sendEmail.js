const nodemailer = require("nodemailer");

/**
 * Generate a premium HTML email template for OTP delivery.
 */
const buildOtpHtml = (otp, purpose = "verification") => {
  const purposeMap = {
    registration: {
      title: "Complete Your Registration",
      subtitle: "You're one step away from joining the UniVerse.",
    },
    login: {
      title: "Login Verification",
      subtitle: "A login attempt was detected on your account.",
    },
    password_reset: {
      title: "Password Reset",
      subtitle: "We received a request to reset your password.",
    },
    verification: {
      title: "Email Verification",
      subtitle: "Please verify your email address.",
    },
  };

  const { title, subtitle } = purposeMap[purpose] || purposeMap["verification"];

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#0a0a1a;font-family:'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:480px;margin:40px auto;background:linear-gradient(145deg,#12122a,#1a1a3e);border-radius:20px;border:1px solid rgba(193,128,255,0.2);overflow:hidden;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#c180ff,#3dc2fd);padding:32px;text-align:center;">
        <h1 style="margin:0;color:white;font-size:28px;font-weight:800;letter-spacing:2px;">⚛ UniVerse</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;text-transform:uppercase;letter-spacing:3px;">Campus Platform</p>
      </div>
      
      <!-- Body -->
      <div style="padding:40px 32px;text-align:center;">
        <h2 style="margin:0 0 8px;color:#c180ff;font-size:22px;font-weight:700;">${title}</h2>
        <p style="color:#8888aa;font-size:14px;margin:0 0 32px;">${subtitle}</p>
        
        <!-- OTP Box -->
        <div style="background:rgba(193,128,255,0.08);border:2px dashed rgba(193,128,255,0.4);border-radius:16px;padding:24px;margin:0 auto;max-width:280px;">
          <p style="margin:0 0 8px;color:#8888aa;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Your OTP Code</p>
          <div style="font-size:40px;font-weight:900;letter-spacing:12px;color:#3dc2fd;font-family:monospace;">${otp}</div>
        </div>
        
        <p style="color:#ff6e84;font-size:13px;margin:24px 0 0;">⏱ This code expires in <strong>10 minutes</strong></p>
        <p style="color:#555;font-size:12px;margin:16px 0 0;">If you didn't request this, please ignore this email.</p>
      </div>
      
      <!-- Footer -->
      <div style="background:rgba(0,0,0,0.3);padding:20px;text-align:center;border-top:1px solid rgba(193,128,255,0.1);">
        <p style="margin:0;color:#444;font-size:11px;">© 2026 UniVerse Platform</p>
      </div>
    </div>
  </body>
  </html>
  `;
};

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"UniVerse Platform" <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // If this is an OTP email, attach the premium HTML template
  if (options.otp) {
    mailOptions.html = buildOtpHtml(options.otp, options.purpose);
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Nodemailer] Email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("[Nodemailer] Error sending email:", error);
    throw new Error("Could not send email.");
  }
};

module.exports = sendEmail;
