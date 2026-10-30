"""Keep invitation bearer secrets out of Uvicorn access logs."""
import logging
import re


class InvitationTokenFilter(logging.Filter):
    def filter(self, record):
        if isinstance(record.args, tuple) and len(record.args) >= 3 and isinstance(record.args[2], str):
            args = list(record.args)
            args[2] = re.sub(r"(/(?:api/)?account/invitations/)[^/?\s]+", r"\1[redacted]", args[2])
            record.args = tuple(args)
        return True


def configure_access_logging():
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(item, InvitationTokenFilter) for item in logger.filters):
        logger.addFilter(InvitationTokenFilter())
