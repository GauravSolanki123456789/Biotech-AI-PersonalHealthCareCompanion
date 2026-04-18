/** Mirrors backend `app/models.py` response shapes. */

export type PatientRecord = {
  patient_id: string;
  age: number;
  condition: string;
  clinical_score: number;
  treatment_plan: string;
};

export type UploadSuccessResponse = {
  message: string;
  records_imported: number;
};

export type MedicalQuery = {
  query: string;
  instrument_mode?: boolean;
};

export type ChatResponse = {
  answer: string;
};

export type UploadColumnErrorDetail = {
  error: string;
  expected_columns: string[];
  received_columns: string[];
};

export type StatsResponse = {
  status: string;
  records_indexed: number;
  embed_model: string;
  openai_configured: boolean;
};
