"""
Flask HTTP API gateway for the Celery OTP email service.
The Node.js backend calls this API to dispatch async email tasks.

Endpoints:
  POST /api/send-otp       — Queue an OTP email
  POST /api/send-reset     — Queue a password-reset email
  GET  /api/task/<task_id>  — Check task status
  GET  /health             — Health check
"""
import os
from flask import Flask, request, jsonify
from tasks import send_otp_email, send_password_reset_email
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "universe-celery-otp"})


@app.route("/api/send-otp", methods=["POST"])
def dispatch_otp():
    """
    Queue an OTP email for async delivery.
    
    Body JSON:
      - email (str, required): Recipient email
      - otp (str, required): 6-digit OTP
      - purpose (str, optional): 'registration' | 'login' | 'password_reset' | 'verification'
    """
    data = request.get_json(force=True)
    email = data.get("email")
    otp = data.get("otp")
    purpose = data.get("purpose", "verification")

    if not email or not otp:
        return jsonify({"error": "email and otp are required"}), 400

    task = send_otp_email.delay(email, otp, purpose)
    return jsonify({
        "status": "queued",
        "task_id": task.id,
        "message": f"OTP email queued for {email}"
    }), 202


@app.route("/api/send-reset", methods=["POST"])
def dispatch_reset():
    """
    Queue a password-reset email for async delivery.
    
    Body JSON:
      - email (str, required): Recipient email
      - reset_url (str, required): Password reset URL
    """
    data = request.get_json(force=True)
    email = data.get("email")
    reset_url = data.get("reset_url")

    if not email or not reset_url:
        return jsonify({"error": "email and reset_url are required"}), 400

    task = send_password_reset_email.delay(email, reset_url)
    return jsonify({
        "status": "queued",
        "task_id": task.id,
        "message": f"Reset email queued for {email}"
    }), 202


@app.route("/api/task/<task_id>", methods=["GET"])
def task_status(task_id):
    """Check the status of a queued email task."""
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    response = {
        "task_id": task_id,
        "state": result.state,
    }
    if result.ready():
        response["result"] = result.result
    return jsonify(response)


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
