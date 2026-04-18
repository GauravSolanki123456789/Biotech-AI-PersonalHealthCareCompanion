from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models import UploadSuccessResponse
from app.rag import rebuild_index
from app.services.csv_parse import parse_patient_csv

router = APIRouter(tags=["upload"])


@router.post("/api/upload", response_model=UploadSuccessResponse)
async def upload_csv(file: UploadFile = File(...)) -> UploadSuccessResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="A CSV file is required.")

    content = await file.read()
    records, expected, received = parse_patient_csv(content)

    if expected != received:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "CSV columns do not match the required PatientRecord schema.",
                "expected_columns": expected,
                "received_columns": received,
            },
        )

    rebuild_index(records)
    n = len(records)
    return UploadSuccessResponse(
        message=(
            f"Upload complete — {n} patient record{'s' if n != 1 else ''} "
            "imported and indexed."
        ),
        records_imported=n,
    )
