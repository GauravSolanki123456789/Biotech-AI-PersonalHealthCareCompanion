"""Pydantic schemas — single source of truth for API contracts."""

from pydantic import BaseModel, Field


class PatientRecord(BaseModel):
    patient_id: str = Field(..., description="Unique patient identifier")
    age: int = Field(..., ge=0, description="Patient age in years")
    condition: str = Field(..., description="Clinical condition")
    clinical_score: float = Field(..., description="Computed clinical score")
    treatment_plan: str = Field(..., description="Planned treatment")


class MedicalQuery(BaseModel):
    query: str = Field(..., min_length=1, description="User question for clinical record retrieval")
    instrument_mode: bool = Field(
        default=False,
        description="When true, request instrument-oriented Python script output",
    )


class UploadSuccessResponse(BaseModel):
    message: str
    records_imported: int


class ChatResponse(BaseModel):
    answer: str
