/** Mirrors backend `app/models.py` response shapes. */

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
