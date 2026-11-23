"""Synthetic utility upload/list/retry and authorization regressions."""
import asyncio
from datetime import date
from unittest.mock import patch
import unittest
import test_rbac as rbac
from app.models.building import Building
from app.models.utility_bill import UtilityBill
from app.models.history_entry import HistoryEntry
from app.parsers.utility_parser import parse_utility_bill
from benchmark_uploads import benchmark, synthetic_pdf


class UtilityUploadTests(unittest.TestCase):
    login = rbac.PermissionsTests.login
    tearDown = rbac.PermissionsTests.tearDown

    def setUp(self):
        from app.migrations import load_models
        load_models()
        rbac.PermissionsTests.setUp(self)
        with self.sessions() as db:
            db.add(Building(parish_id=1, name='Hall', account_numbers={'electric': 'TEST-001'}))
            db.commit()

    def upload(self, key='test-key'):
        return self.client.post('/upload/', data={'parish_id': '1', 'doc_type': 'utility', 'upload_key': key},
            files={'file': ('synthetic.pdf', synthetic_pdf(), 'application/pdf')})

    def test_upload_lists_resolved_building_after_reload_and_retries_once(self):
        bill = {'bill_date': date(2026, 1, 31), 'total_amount': 42.5, 'utility_type': 'electricity', 'account_number': 'TEST-001'}
        # Reuse the same bytes, as browsers do when retrying a staged File.
        pdf = synthetic_pdf()
        def send():
            return self.client.post('/upload/', data={'parish_id': '1', 'doc_type': 'utility', 'upload_key': 'same'}, files={'file': ('bill.pdf', pdf)})
        with patch('app.routers.upload.parse_utility_bill', return_value=[bill]) as parser:
            first, second = send(), send()
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.json(), second.json())
            self.assertEqual(parser.call_count, 1)
        for _ in range(2):
            rows = self.client.get('/data/utility/1?building_name=Hall&utility_type=electric').json()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['building_name'], 'Hall')
        with self.sessions() as db:
            self.assertEqual(db.query(HistoryEntry).filter_by(parish_id=1, entry_type='upload').count(), 1)

    def test_failure_is_atomic_and_retry_can_succeed(self):
        with patch('app.routers.upload.parse_utility_bill', side_effect=RuntimeError('synthetic')):
            self.assertEqual(self.upload().status_code, 502)
        with patch('app.routers.upload.parse_utility_bill', return_value=[]):
            result = self.upload()
            self.assertFalse(result.json()['success'])
        with self.sessions() as db:
            self.assertEqual(db.query(UtilityBill).filter_by(parish_id=1).count(), 0)
        with patch('app.routers.upload.parse_utility_bill', return_value=[{'bill_date': date(2026, 1, 1), 'total_amount': 0}]):
            self.assertTrue(self.upload().json()['success'])

    def test_upload_permissions(self):
        with patch('app.routers.upload.parse_utility_bill') as parser:
            for user, expected in [(2, 403), (3, 403), (4, 404)]:
                self.login(user)
                self.assertEqual(self.upload().status_code, expected)
            parser.assert_not_called()

    def test_partial_parser_failure_does_not_report_success(self):
        with patch('app.parsers.utility_parser._send_to_llm', side_effect=[[{'bill_date': '2026-01-01', 'total_amount': 10}], RuntimeError('offline')]):
            with self.assertRaises(RuntimeError):
                parse_utility_bill('unused', extracted_text='\n\n--- PAGE BREAK ---\n\n'.join(['page'] * 4))

    def test_worker_pool_keeps_event_loop_responsive(self):
        elapsed, probe = asyncio.run(benchmark())
        self.assertLess(probe, 0.15)
        self.assertLess(elapsed, 0.75)

    def test_concurrent_retries_commit_only_one_bill_and_audit(self):
        asyncio.run(benchmark(same_key=True))

    @unittest.skipUnless(__import__('os').environ.get('TEST_POSTGRES_URL'), 'Disposable PostgreSQL URL not supplied')
    def test_concurrent_retries_postgres(self):
        import os
        import uuid
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import make_url
        url = make_url(os.environ['TEST_POSTGRES_URL'])
        self.assertIn(url.host, {'localhost', '127.0.0.1'})
        self.assertEqual(url.port, 55432)
        schema = 'aoa_upload_' + uuid.uuid4().hex
        bootstrap = create_engine(url)
        target = None
        try:
            with bootstrap.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            target = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
            asyncio.run(benchmark(same_key=True, target=target))
        finally:
            if target is not None:
                target.dispose()
            with bootstrap.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            bootstrap.dispose()
