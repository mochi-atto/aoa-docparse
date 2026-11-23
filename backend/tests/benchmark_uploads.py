"""Offline ASGI concurrency check. No real parser latency is claimed."""
import asyncio
from datetime import date
import tempfile
import time
from types import SimpleNamespace
from unittest.mock import patch
import fitz
import httpx
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.migrations import load_models
from app.routers import upload


def synthetic_pdf():
    with fitz.open() as doc:
        doc.new_page().insert_text((72, 72), 'Synthetic Electric\nAccount TEST-001\nPeriod 2026-01-01 to 2026-01-31\nCurrent charges $42.50\nBilled usage 1200 kWh\nPrior year 900 kWh\nMeter readings 10000 / 11200')
        return doc.tobytes()


async def benchmark(same_key=False):
    load_models()
    with tempfile.TemporaryDirectory() as directory:
        engine = create_engine(f'sqlite:///{directory}/test.sqlite', connect_args={'check_same_thread': False})
        Base.metadata.create_all(engine)
        sessions = sessionmaker(bind=engine)
        app = FastAPI()
        app.include_router(upload.router, prefix='/upload')
        def database():
            with sessions() as db:
                yield db
        app.dependency_overrides[get_db] = database
        app.dependency_overrides[upload.upload_admin_access] = lambda: SimpleNamespace(account=SimpleNamespace(auth0_sub='synthetic'))
        @app.get('/ping')
        async def ping():
            return {'ok': True}
        def parser(*args, **kwargs):
            time.sleep(0.2)
            return [{'bill_date': date(2026, 1, 31), 'total_amount': 42.5, 'usage_quantity': 1200, 'usage_unit': 'kWh'}]
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            pdf = synthetic_pdf()
            async def send(i):
                return await client.post('/upload/', data={'parish_id': '1', 'doc_type': 'utility', 'upload_key': 'retry' if same_key else f'upload-{i}'}, files={'file': (f'synthetic-{i}.pdf', pdf, 'application/pdf')})
            delays = []
            async def monitor():
                start = time.perf_counter()
                await asyncio.sleep(0.01)
                await client.get('/ping')
                delays.append(time.perf_counter() - start)
            with patch.object(upload, 'parse_utility_bill', parser):
                start = time.perf_counter()
                results = await asyncio.gather(*(send(i) for i in range(4)), monitor())
                elapsed = time.perf_counter() - start
            assert all(r.status_code == 200 and r.json()['success'] for r in results[:-1])
            print(f'4 uploads, controlled parser 0.200s each: batch={elapsed:.3f}s; event-loop probe={delays[0]:.3f}s')
        from app.models.utility_bill import UtilityBill
        from app.models.history_entry import HistoryEntry
        with sessions() as db:
            assert db.query(UtilityBill).count() == (1 if same_key else 4)
            assert db.query(HistoryEntry).count() == (1 if same_key else 4)
        engine.dispose()
        return elapsed, delays[0]

if __name__ == '__main__':
    asyncio.run(benchmark())
