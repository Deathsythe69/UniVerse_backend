"""
Celery application factory for UniVerse OTP email service.
Uses Redis as the message broker and result backend.
"""
import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

celery = Celery(
    "universe_otp",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=["tasks"]
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=60,        # Hard kill after 60s
    task_soft_time_limit=30,   # Soft warning at 30s
    worker_max_tasks_per_child=200,  # Restart workers periodically to prevent leaks
    broker_connection_retry_on_startup=True,
)
