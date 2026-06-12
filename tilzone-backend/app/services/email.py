import smtplib
from email.message import EmailMessage

from app.config import settings


class EmailDeliveryError(RuntimeError):
    pass


def send_email(to_email: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        if settings.env == "dev":
            print(f"[SMTP disabled] To: {to_email}\nSubject: {subject}\n{body}")
            return
        raise EmailDeliveryError("SMTP_HOST is not configured")

    message = EmailMessage()
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailDeliveryError(str(exc)) from exc


def send_verification_code(to_email: str, code: str) -> None:
    send_email(
        to_email,
        "TilZone email verification",
        f"Your TilZone verification code is: {code}",
    )


def send_password_reset(to_email: str, token: str) -> None:
    send_email(
        to_email,
        "TilZone password reset",
        "Use this token to reset your TilZone password:\n\n"
        f"{token}\n\n"
        "If you did not request this, ignore this email.",
    )
