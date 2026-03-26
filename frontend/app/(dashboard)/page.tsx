import { UploadPanel } from "@/components/upload-panel";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Upload Data
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload a CSV whose columns must match{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
            patient_id, age, condition, clinical_score, treatment_plan
          </code>{" "}
          exactly.
        </p>
      </div>
      <UploadPanel />
    </div>
  );
}
