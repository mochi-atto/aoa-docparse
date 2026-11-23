"""Billed consumption, valuation density, notes and legacy migration tests."""
import unittest
from datetime import date
from unittest.mock import patch
from sqlalchemy import create_engine, text
from app.migrations import migrate, load_models
from app.models.appraisal import Appraisal
from app.models.building import Building
from app.services.utility_usage import normalize_usage, energy_density
from app.parsers.utility_parser import _clean_bill, parse_utility_bill, EXTRACTION_PROMPT
import test_rbac as rbac

class UtilityUsageTests(unittest.TestCase):
    login = rbac.PermissionsTests.login
    tearDown = rbac.PermissionsTests.tearDown
    def setUp(self):
        load_models()
        rbac.PermissionsTests.setUp(self)
        with self.sessions() as db:
            db.add(Building(parish_id=1, name='Hall', account_numbers={'electric': 'TEST-001'}))
            db.add(Appraisal(parish_id=1, original_filename='synthetic.pdf', appraisal_date=date(2025, 1, 1), raw_extracted={'sections': [{'building_name': 'Hall', 'gross_sq_ft': 1000}]}))
            db.commit()
    def create(self, **updates):
        body = dict(parish_id=1, building_name='Hall', utility_type='electric', bill_date='2026-01-31', total_amount=42.5,
            billing_period_start='2026-01-01', billing_period_end='2026-01-31', usage_quantity=1200, usage_unit='kWh')
        return self.client.post('/data/utility/manual', json={**body, **updates})
    def test_density_and_note_add_edit_clear_reload(self):
        result = self.create()
        self.assertEqual(result.status_code, 200, result.text)
        bill = result.json()['id']
        for note in ['Building closed for repairs', 'Heating schedule changed', '', None]:
            response = self.client.put(f'/data/utility/{bill}', json={'usage_note': note})
            self.assertEqual(response.status_code, 200, response.text)
            row = self.client.get('/data/utility/1').json()[0]
            self.assertEqual(row['usage_note'], note or None)
            self.assertEqual(row['usage_quantity'], 1200)
            self.assertEqual(row['usage_unit'], 'kWh')
            self.assertAlmostEqual(row['energy_per_sq_ft'], 4.0944)
            self.assertEqual(row['billing_period_end'], '2026-01-31')
        for note in ['x'*2001, 42]:
            self.assertEqual(self.client.put(f'/data/utility/{bill}', json={'usage_note': note}).status_code, 422)
    def test_gas_water_zero_missing_legacy_and_unsupported_units(self):
        for utility, quantity, unit, expected in [('gas', 20, 'therm', 2), ('water', 500, 'gallons', None),
                ('electric', 0, 'kWh', 0), ('electric', None, None, None), ('gas', 40, 'CCF', None)]:
            self.assertEqual(self.create(utility_type=utility, usage_quantity=quantity, usage_unit=unit).status_code, 200)
            row = self.client.get('/data/utility/1').json()[-1]
            self.assertEqual(row['energy_per_sq_ft'], expected)
            self.assertEqual(row['usage_quantity'], quantity)
        self.login(2)
        row = self.client.get('/data/utility/2').json()[0]
        self.assertIsNone(row['usage_note'])
        self.assertIsNone(row['energy_per_sq_ft'])
    def test_area_is_building_specific_no_future_or_zero_area(self):
        self.create()
        with self.sessions() as db:
            db.add(Appraisal(parish_id=1, original_filename='future.pdf', appraisal_date=date(2027, 1, 1), raw_extracted={'sections': [{'building_name': 'Hall', 'gross_sq_ft': 9000}]}))
            db.add(Appraisal(parish_id=2, original_filename='other.pdf', entity_name='Hall', appraisal_date=date(2025, 2, 1), gross_sq_ft=50))
            db.commit()
        self.assertEqual(self.client.get('/data/utility/1').json()[0]['valuation_sq_ft'], 1000)
        for area in [0, None]:
            with self.sessions() as db:
                db.add(Appraisal(parish_id=1, original_filename='new.pdf', appraisal_date=date(2026, 1, 1), raw_extracted={'sections': [{'building_name': 'Hall', 'gross_sq_ft': area}]}))
                db.commit()
            self.assertIsNone(self.client.get('/data/utility/1').json()[0]['energy_per_sq_ft'])
        self.create(building_name=None)
        self.assertIsNone(self.client.get('/data/utility/1').json()[-1]['energy_per_sq_ft'])
    def test_roles_notes_manual_and_read_isolation(self):
        bill = self.create().json()['id']
        for user, write, read in [(2, 403, 200), (3, 403, 200), (4, 404, 404)]:
            self.login(user)
            self.assertEqual(self.create().status_code, write)
            self.assertEqual(self.client.put(f'/data/utility/{bill}', json={'usage_note': 'denied'}).status_code, write)
            self.assertEqual(self.client.get('/data/utility/1').status_code, read)
        self.login(1)
        self.assertEqual(self.create(building_name='Other parish').status_code, 422)
        self.assertEqual(self.create(usage_quantity=-1).status_code, 422)
        self.assertEqual(self.create(billing_period_start='2026-02-01').status_code, 422)
    def test_normalization_contract_and_controlled_parser(self):
        self.assertEqual(normalize_usage(1.2, 'MWh', 'electric'), (1200, 'kWh'))
        self.assertEqual(normalize_usage(0, 'therm', 'gas'), (0, 'therms'))
        for quantity in [None, float('nan'), float('inf'), -1, 'unknown']:
            self.assertEqual(normalize_usage(quantity, 'kWh', 'electric'), (None, None))
        self.assertIsNone(energy_density(42, 'gallons', 'water', 1000))
        self.assertIsNone(energy_density(42, 'kWh', 'electric', 0))
        self.assertIn('prior-year comparison', EXTRACTION_PROMPT)
        with patch('app.parsers.utility_parser._send_to_llm', return_value=[{'bill_date': '2026-01-31', 'total_amount': 0, 'utility_type': 'electric', 'usage_quantity': 0, 'usage_unit': 'kWh'}]):
            rows = parse_utility_bill('unused', extracted_text='Billed usage 0 kWh; prior-year 900 kWh; current charges 0 dollars')
        self.assertEqual(rows[0]['usage_quantity'], 0)
        self.assertIsNone(_clean_bill({'total_amount': 'missing'})['total_amount'])
    def test_notes_export_as_text_and_usage_column_survives(self):
        import io
        from openpyxl import load_workbook
        from app.services.parish_export import build_parish_workbook
        from app.models.parish import Parish
        bill = self.create().json()['id']
        self.client.put(f'/data/utility/{bill}', json={'usage_note': '=1+1'})
        with self.sessions() as db:
            workbook = load_workbook(io.BytesIO(build_parish_workbook(db, db.get(Parish, 1), include_access=False, today=date(2026, 11, 22))))
        sheet = workbook['Utilities']
        headers = [c.value for c in sheet[1]]
        note = sheet.cell(2, headers.index('Notes')+1)
        self.assertEqual(note.value, '=1+1')
        self.assertEqual(note.data_type, 's')
        self.assertEqual(sheet.cell(2, headers.index('Usage (kWh)')+1).value, 1200)

class UtilityMigrationTests(unittest.TestCase):
    def test_upgrade_existing_bill_and_repeat(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as db:
            db.execute(text('CREATE TABLE utility_bills (id INTEGER PRIMARY KEY, parish_id INTEGER, bill_date DATE, total_amount FLOAT, usage_quantity FLOAT, usage_unit VARCHAR)'))
            db.execute(text("INSERT INTO utility_bills VALUES (7, 1, '2026-01-01', 42, 0, 'kWh')"))
        self.assertTrue(any('usage_note' in s for s in migrate(engine)['additive_statements']))
        migrate(engine, apply=True)
        with engine.connect() as db:
            self.assertEqual(tuple(db.execute(text('SELECT id, total_amount, usage_quantity, usage_note FROM utility_bills')).one()), (7, 42, 0, None))
        self.assertEqual(migrate(engine)['additive_statements'], [])
        migrate(engine, apply=True)

import os
@unittest.skipUnless(os.environ.get('TEST_POSTGRES_URL'), 'Disposable PostgreSQL URL not supplied')
class UtilityPostgresMigrationTests(unittest.TestCase):
    def test_existing_bill_upgrade_postgres(self):
        import uuid
        from sqlalchemy.engine import make_url
        url = make_url(os.environ['TEST_POSTGRES_URL'])
        self.assertIn(url.host, {'localhost', '127.0.0.1'})
        self.assertEqual(url.port, 55432)
        schema = 'aoa_usage_' + uuid.uuid4().hex
        bootstrap = create_engine(url)
        target = None
        try:
            with bootstrap.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            target = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
            migrate(target, apply=True)
            with target.begin() as connection:
                connection.execute(text('ALTER TABLE utility_bills DROP COLUMN usage_note'))
                connection.execute(text("INSERT INTO parishes (id,name) VALUES (1,'Synthetic upgrade')"))
                connection.execute(text("INSERT INTO utility_bills (id,parish_id,original_filename,bill_date,total_amount,usage_quantity,usage_unit) VALUES (1,1,'legacy.pdf','2026-01-01',42,0,'kWh')"))
            migrate(target, apply=True)
            with target.connect() as connection:
                self.assertEqual(tuple(connection.execute(text('SELECT total_amount,usage_quantity,usage_note FROM utility_bills')).one()), (42, 0, None))
            self.assertEqual(migrate(target)['additive_statements'], [])
        finally:
            if target is not None:
                target.dispose()
            with bootstrap.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            bootstrap.dispose()
