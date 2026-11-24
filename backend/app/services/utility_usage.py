"""Conservative billed-usage normalization and per-bill site energy density."""
import math


def normalize_usage(quantity, unit, utility_type):
    if quantity is None:
        return None, None
    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        return None, None
    if not math.isfinite(quantity) or quantity < 0:
        return None, None
    unit = (unit or '').strip()
    aliases = {
        'electric': {'kwh': ('kWh', 1), 'kilowatt-hours': ('kWh', 1), 'mwh': ('kWh', 1000)},
        'gas': {'therm': ('therms', 1), 'therms': ('therms', 1)},
        'water': {'gal': ('gallons', 1), 'gallon': ('gallons', 1), 'gallons': ('gallons', 1)},
    }
    canonical, factor = aliases.get(utility_type, {}).get(unit.lower(), (unit or None, 1))
    return quantity * factor, canonical


def energy_density(quantity, unit, utility_type, sqft):
    """kBtu per ft² for THIS bill period; never annualized or water-inclusive.

    EPA Thermal Conversions: electricity 3.412 kBtu/kWh, gas 100 kBtu/therm.
    Volume-based gas needs a supplier heat factor; do not guess it.
    """
    quantity, unit = normalize_usage(quantity, unit, utility_type)
    factor = {('electric', 'kWh'): 3.412, ('gas', 'therms'): 100}.get((utility_type, unit))
    if quantity is None or factor is None or sqft is None or not math.isfinite(sqft) or sqft <= 0:
        return None
    return quantity * factor / sqft


def valuation_area(appraisals, building, period_end):
    """Latest unambiguous building valuation dated on/before the bill period end."""
    if not building or not period_end:
        return None, None
    candidates = [a for a in appraisals if a.building_name and
        a.building_name.strip().casefold() == building.strip().casefold() and
        a.appraisal_date and a.appraisal_date <= period_end.isoformat()]
    if not candidates:
        return None, None
    latest = max(candidates, key=lambda a: (a.appraisal_date, a.id or 0))
    if sum(a.id == latest.id for a in candidates) != 1:
        return None, latest.appraisal_date
    return latest.gross_sq_ft, latest.appraisal_date
