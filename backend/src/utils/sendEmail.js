const nodemailer = require("nodemailer");

/**
 * Celery-first email dispatcher.
 * Tries the Python Celery worker API first (async, queued, with retries).
 * Falls back to direct Nodemailer if the Celery service is unreachable.
 */
const CELERY_API = process.env.CELERY_API_URL || "http://localhost:5001";

const sendEmail = async (options) => {
  // --- Attempt 1: Celery Worker (preferred) ---
  try {
    const payload = {};

    if (options.otp) {
      // OTP email via Celery
      const response = await fetch(`${CELERY_API}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: options.email,
          otp: options.otp,
          purpose: options.purpose || "verification",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[Celery] OTP email queued: ${data.task_id}`);
        return true;
      }
    } else if (options.resetUrl) {
      // Password reset email via Celery
      const response = await fetch(`${CELERY_API}/api/send-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: options.email,
          reset_url: options.resetUrl,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[Celery] Reset email queued: ${data.task_id}`);
        return true;
      }
    }
  } catch (err) {
    console.warn(`[Celery] Worker unreachable, falling back to Nodemailer: ${err.message}`);
  }

  // --- Fallback: Direct Nodemailer ---
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
