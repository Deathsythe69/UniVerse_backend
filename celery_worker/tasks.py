"""
Celery tasks for asynchronous OTP email delivery.
Handles registration OTP, login OTP, and password-reset emails.
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from celery_app import celery
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
SMTP_FROM = os.getenv("SMTP_FROM", f"UniVerse Platform <{SMTP_USER}>")


def _build_otp_html(otp: str, purpose: str = "verification") -> str:
    """Generate a premium HTML email template for OTP delivery."""
    purpose_map = {
        "registration": ("Complete Your Registration", "You're one step away from joining the UniVerse."),
        "login": ("Login Verification", "A login attempt was detected on your account."),
        "password_reset": ("Password Reset", "We received a request to reset your password."),
        "verification": ("Email Verification", "Please verify your email address."),
    }
    title, subtitle = purpose_map.get(purpose, purpose_map["verification"])

    return f"""
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
          <h2 style="margin:0 0 8px;color:#c180ff;font-size:22px;font-weight:700;">{title}</h2>
          <p style="color:#8888aa;font-size:14px;margin:0 0 32px;">{subtitle}</p>
          
          <!-- OTP Box -->
          <div style="background:rgba(193,128,255,0.08);border:2px dashed rgba(193,128,255,0.4);border-radius:16px;padding:24px;margin:0 auto;max-width:280px;">
            <p style="margin:0 0 8px;color:#8888aa;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Your OTP Code</p>
            <div style="font-size:40px;font-weight:900;letter-spacing:12px;color:#3dc2fd;font-family:monospace;">{otp}</div>
          </div>
          
          <p style="color:#ff6e84;font-size:13px;margin:24px 0 0;">⏱ This code expires in <strong>10 minutes</strong></p>
          <p style="color:#555;font-size:12px;margin:16px 0 0;">If you didn't request this, please ignore this email.</p>
        </div>
        
        <!-- Footer -->
        <div style="background:rgba(0,0,0,0.3);padding:20px;text-align:center;border-top:1px solid rgba(193,128,255,0.1);">
          <p style="margin:0;color:#444;font-size:11px;">© 2026 UniVerse Platform • Secured by Celery</p>
        </div>
      </div>
    </body>
    </html>
    """


@celery.task(bind=True, max_retries=3, default_retry_delay=10, name="tasks.send_otp_email")
def send_otp_email(self, to_email: str, otp: str, purpose: str = "verification"):
    """
    Asynchronous OTP email sender via SMTP.
    
    Args:
        to_email: Recipient email address
        otp: The 6-digit OTP string
        purpose: One of 'registration', 'login', 'password_reset', 'verification'
    
    Returns:
        dict with status and message_id
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"UniVerse OTP: {otp}"
        msg["From"] = SMTP_FROM
        msg["To"] = to_email

        # Plain text fallback
        text_body = f"Your UniVerse OTP is: {otp}\nThis code expires in 10 minutes."
        html_body = _build_otp_html(otp, purpose)

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())

        return {"status": "sent", "to": to_email, "purpose": purpose}

    except smtplib.SMTPAuthenticationError as exc:
        # Don't retry auth errors — credentials are wrong
        return {"status": "auth_error", "error": str(exc)}

    except Exception as exc:
        # Retry transient errors (network, timeout, etc.)
        raise self.retry(exc=exc)


@celery.task(bind=True, max_retries=3, default_retry_delay=10, name="tasks.send_password_reset_email")
def send_password_reset_email(self, to_email: str, reset_url: str):
    """Send a password reset link email."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Password Reset - UniVerse"
        msg["From"] = SMTP_FROM
        msg["To"] = to_email

        text_body = f"Reset your password: {reset_url}\nThis link expires in 1 hour."
        html_body = f"""
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#0a0a1a;font-family:'Segoe UI',Roboto,sans-serif;">
          <div style="max-width:480px;margin:40px auto;background:linear-gradient(145deg,#12122a,#1a1a3e);border-radius:20px;border:1px solid rgba(193,128,255,0.2);overflow:hidden;">
            <div style="background:linear-gradient(135deg,#c180ff,#3dc2fd);padding:32px;text-align:center;">
              <h1 style="margin:0;color:white;font-size:28px;font-weight:800;letter-spacing:2px;">⚛ UniVerse</h1>
            </div>
            <div style="padding:40px 32px;text-align:center;">
              <h2 style="color:#c180ff;font-size:22px;">Password Reset</h2>
              <p style="color:#8888aa;font-size:14px;">Click the button below to reset your password.</p>
              <a href="{reset_url}" style="display:inline-block;margin:24px 0;padding:14px 40px;background:linear-gradient(135deg,#c180ff,#3dc2fd);color:white;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px;">Reset Password</a>
              <p style="color:#ff6e84;font-size:13px;">⏱ This link expires in <strong>1 hour</strong></p>
            </div>
            <div style="background:rgba(0,0,0,0.3);padding:20px;text-align:center;border-top:1px solid rgba(193,128,255,0.1);">
              <p style="margin:0;color:#444;font-size:11px;">© 2026 UniVerse Platform</p>
            </div>
          </div>
        </body></html>
        """

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())

        return {"status": "sent", "to": to_email}

    except smtplib.SMTPAuthenticationError as exc:
        return {"status": "auth_error", "error": str(exc)}

    except Exception as exc:
        raise self.retry(exc=exc)
