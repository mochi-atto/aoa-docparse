import logging
import unittest
from app.logging_filters import InvitationTokenFilter


class LoggingFilterTests(unittest.TestCase):
    def test_invitation_secret_is_redacted_from_access_log(self):
        record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "%s %s %s %s %s", ("local", "POST", "/api/account/invitations/synthetic-token/accept", "1.1", 200), None)
        self.assertTrue(InvitationTokenFilter().filter(record))
        self.assertNotIn("synthetic-token", record.getMessage())
        self.assertIn("[redacted]/accept", record.getMessage())

    def test_normal_paths_are_unchanged(self):
        record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "%s %s %s %s %s", ("local", "GET", "/api/parishes/1", "1.1", 200), None)
        InvitationTokenFilter().filter(record)
        self.assertIn("/api/parishes/1", record.getMessage())
