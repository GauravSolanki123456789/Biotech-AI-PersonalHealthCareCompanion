"""Parse CSV into PatientRecord with strict column validation."""

from io import BytesIO

import pandas as pd

from app.models import PatientRecord

EXPECTED_COLUMNS = [
    "patient_id",
    "age",
    "condition",
    "clinical_score",
    "treatment_plan",
]


def parse_patient_csv(content: bytes) -> tuple[list[PatientRecord], list[str], list[str]]:
    """
    Returns (records, expected_columns, received_columns).
    If columns mismatch, records is empty; expected vs received describe the error.
    """
    buffer = BytesIO(content)
    df = pd.read_csv(buffer)
    received = [str(c).strip() for c in df.columns.tolist()]
    expected = list(EXPECTED_COLUMNS)

    if received != expected:
        return [], expected, received

    records: list[PatientRecord] = []
    for _, row in df.iterrows():
        records.append(
            PatientRecord(
                patient_id=str(row["patient_id"]).strip(),
                age=int(row["age"]),
                condition=str(row["condition"]).strip(),
                clinical_score=float(row["clinical_score"]),
                treatment_plan=str(row["treatment_plan"]).strip(),
            )
        )
    return records, expected, received
