import React, { useState, useRef } from "react";
import Papa from "papaparse";
import {
  FileSpreadsheet,
  Upload,
  Link,
  Clipboard,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  FileText,
  Table,
  Check,
  HelpCircle,
} from "lucide-react";

export interface ImportFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  sampleValue?: string;
  description?: string;
}

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  entityName: string;
  fields: ImportFieldDefinition[];
  onImport: (rows: Record<string, any>[]) => Promise<{ successCount: number; errors?: string[] }> | { successCount: number; errors?: string[] };
}

export default function DataImportModal({
  isOpen,
  onClose,
  title,
  entityName,
  fields,
  onImport,
}: DataImportModalProps) {
  const [activeMode, setActiveMode] = useState<"file" | "sheets" | "paste">("sheets");

  // Google Sheets state
  const [sheetUrl, setSheetUrl] = useState("");
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  // Raw paste state
  const [pastedText, setPastedText] = useState("");

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  // Parsed Data state
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({}); // fieldKey -> csvHeader

  // Step state: 1 = Input/Upload, 2 = Mapping & Preview, 3 = Complete
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Status & Progress
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ successCount: number; errors?: string[] } | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setSheetUrl("");
    setPastedText("");
    setSelectedFileName(null);
    setParsedHeaders([]);
    setParsedRows([]);
    setColumnMapping({});
    setStep(1);
    setStatusMsg(null);
    setIsImporting(false);
    setImportResult(null);
  };

  const processCsvContent = (csvString: string, sourceName?: string) => {
    setStatusMsg(null);
    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          console.warn("CSV parse warnings:", results.errors);
        }

        const data = results.data as Record<string, string>[];
        if (!data || data.length === 0) {
          setStatusMsg({ type: "error", text: "No data rows found in the provided CSV content." });
          return;
        }

        const headers = results.meta.fields || (data[0] ? Object.keys(data[0]) : []);
        setParsedHeaders(headers);
        setParsedRows(data);

        // Auto-map fields by fuzzy name matching
        const initialMap: Record<string, string> = {};
        fields.forEach((f) => {
          const fieldNameLower = f.label.toLowerCase().replace(/[^a-z0-9]/g, "");
          const keyLower = f.key.toLowerCase().replace(/[^a-z0-9]/g, "");

          const matchedHeader = headers.find((h) => {
            const hLower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
            return hLower === fieldNameLower || hLower === keyLower || hLower.includes(fieldNameLower) || fieldNameLower.includes(hLower);
          });

          if (matchedHeader) {
            initialMap[f.key] = matchedHeader;
          } else {
            initialMap[f.key] = "";
          }
        });

        setColumnMapping(initialMap);
        setStep(2);
        setStatusMsg({
          type: "success",
          text: `Successfully parsed ${data.length} row(s) from ${sourceName || "source"}. Please review column mappings.`,
        });
      },
      error: (err: any) => {
        setStatusMsg({ type: "error", text: `Failed to parse CSV: ${err.message || err}` });
      },
    });
  };

  // Convert Google Sheets URL to export CSV link
  const handleFetchGoogleSheets = async () => {
    if (!sheetUrl.trim()) {
      setStatusMsg({ type: "error", text: "Please enter a valid Google Sheets URL." });
      return;
    }

    setIsFetchingSheet(true);
    setStatusMsg(null);

    try {
      let exportUrl = sheetUrl.trim();

      // Extract Sheet ID if standard Google Sheets URL
      const sheetIdMatch = exportUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (sheetIdMatch && sheetIdMatch[1]) {
        const sheetId = sheetIdMatch[1];
        // Check if GID is present
        const gidMatch = exportUrl.match(/[#&?]gid=([0-9]+)/);
        const gid = gidMatch ? gidMatch[1] : "0";
        exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      }

      const res = await fetch(exportUrl);
      if (!res.ok) {
        throw new Error(`Unable to fetch Google Sheet (HTTP ${res.status}). Ensure the sheet link is shared as "Anyone with the link can view".`);
      }

      const text = await res.text();
      processCsvContent(text, "Google Sheets");
    } catch (err: any) {
      console.error("Error fetching Google Sheet:", err);
      setStatusMsg({
        type: "error",
        text: err.message || "Failed to fetch Google Sheet. Please check the URL and ensure the sheet is publicly accessible or download as CSV and upload.",
      });
    } finally {
      setIsFetchingSheet(false);
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        processCsvContent(text, file.name);
      }
    };
    reader.onerror = () => {
      setStatusMsg({ type: "error", text: "Failed to read file." });
    };
    reader.readAsText(file);
  };

  // Handle Pasted Text
  const handleParsePasted = () => {
    if (!pastedText.trim()) {
      setStatusMsg({ type: "error", text: "Please paste CSV or tab-separated data into the text box." });
      return;
    }
    processCsvContent(pastedText.trim(), "Pasted Text");
  };

  // Download Sample Template CSV
  const handleDownloadTemplate = () => {
    const headers = fields.map((f) => f.label);
    const sampleRow = fields.map((f) => f.sampleValue || "Sample Data");
    const csvContent = [headers.join(","), sampleRow.map((v) => `"${v}"`).join(",")].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${entityName.toLowerCase().replace(/\s+/g, "_")}_import_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Execute Import
  const handleExecuteImport = async () => {
    if (parsedRows.length === 0) return;

    // Check required fields mapping
    const missingRequiredField = fields.find((f) => f.required && !columnMapping[f.key]);
    if (missingRequiredField) {
      setStatusMsg({
        type: "error",
        text: `Please map the required field "${missingRequiredField.label}" to a CSV column.`,
      });
      return;
    }

    setIsImporting(true);
    setStatusMsg(null);

    // Map rows to target field keys
    const formattedRows = parsedRows.map((row) => {
      const mappedRow: Record<string, any> = {};
      fields.forEach((f) => {
        const mappedHeader = columnMapping[f.key];
        if (mappedHeader && row[mappedHeader] !== undefined) {
          mappedRow[f.key] = row[mappedHeader].trim();
        }
      });
      return mappedRow;
    });

    try {
      const res = await onImport(formattedRows);
      setImportResult(res);
      setStep(3);
    } catch (err: any) {
      console.error("Error executing import:", err);
      setStatusMsg({ type: "error", text: `Import failed: ${err.message || err}` });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden animate-fade-in flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 p-2 rounded-xl">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h3 className="text-xs font-extrabold tracking-wide uppercase font-mono text-emerald-400">
                Data Import Wizard
              </h3>
              <p className="text-sm font-extrabold text-white">{title}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="hidden sm:flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
              title="Download Sample CSV Template"
            >
              <Download size={13} className="text-emerald-400" />
              <span>Sample Template</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Wizard Steps Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs font-mono shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === 1 ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              1
            </span>
            <span className={step === 1 ? "font-bold text-slate-900" : "text-slate-500"}>Source Input</span>
          </div>

          <ArrowRight size={12} className="text-slate-300" />

          <div className="flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === 2 ? "bg-emerald-600 text-white" : step > 2 ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"
              }`}
            >
              2
            </span>
            <span className={step === 2 ? "font-bold text-slate-900" : "text-slate-500"}>Mapping & Preview</span>
          </div>

          <ArrowRight size={12} className="text-slate-300" />

          <div className="flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === 3 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              3
            </span>
            <span className={step === 3 ? "font-bold text-slate-900" : "text-slate-500"}>Import Summary</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Status Message */}
          {statusMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2.5 border ${
                statusMsg.type === "success"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                  : statusMsg.type === "error"
                  ? "bg-rose-50 border-rose-300 text-rose-900"
                  : "bg-blue-50 border-blue-300 text-blue-900"
              }`}
            >
              {statusMsg.type === "success" ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : statusMsg.type === "error" ? (
                <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <HelpCircle size={16} className="text-blue-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span>{statusMsg.text}</span>
              </div>
            </div>
          )}

          {/* STEP 1: Choose Import Source */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Source Mode Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setActiveMode("sheets")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    activeMode === "sheets" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Link size={14} className="text-emerald-600" />
                  <span>Google Sheets Link</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMode("file")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    activeMode === "file" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Upload size={14} className="text-blue-600" />
                  <span>CSV File Upload</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMode("paste")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    activeMode === "paste" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Clipboard size={14} className="text-purple-600" />
                  <span>Paste Data / TSV</span>
                </button>
              </div>

              {/* Google Sheets Mode */}
              {activeMode === "sheets" && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-800 uppercase font-mono block">
                      Google Sheets Share URL
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Paste the link to your Google Sheet. Ensure the sheet permission is set to <strong>"Anyone with the link can view"</strong>.
                    </p>
                    <input
                      type="url"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="e.g. https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="sm:hidden text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      <Download size={13} /> Download Sample Template
                    </button>

                    <button
                      type="button"
                      disabled={isFetchingSheet || !sheetUrl.trim()}
                      onClick={handleFetchGoogleSheets}
                      className="ml-auto bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-extrabold text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-xs cursor-pointer transition-all"
                    >
                      {isFetchingSheet ? <RefreshCw size={14} className="animate-spin" /> : <Link size={14} />}
                      <span>{isFetchingSheet ? "Fetching Sheet Data..." : "Fetch & Parse Google Sheet"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* File Upload Mode */}
              {activeMode === "file" && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-white p-6 rounded-xl text-center cursor-pointer transition-all space-y-2 group"
                  >
                    <div className="bg-emerald-50 text-emerald-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                      <Upload size={22} />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">
                        {selectedFileName ? selectedFileName : "Click or drag & drop a .CSV file here"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Supports standard CSV files exported from Excel, Google Sheets, or CRM systems
                      </p>
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              )}

              {/* Paste Mode */}
              {activeMode === "paste" && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-800 uppercase font-mono block">
                      Paste Spreadsheet Data
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Copy rows from Excel or Google Sheets (including headers) and paste them directly into the text box below.
                    </p>
                    <textarea
                      rows={5}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="e.g.&#10;Name,SKU,Price&#10;Widget A,SKU-001,49.99&#10;Widget B,SKU-002,79.99"
                      className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!pastedText.trim()}
                      onClick={handleParsePasted}
                      className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-extrabold text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-xs cursor-pointer transition-all"
                    >
                      <Clipboard size={14} />
                      <span>Parse Pasted Data</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Expected Fields Info Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                  <Table size={14} className="text-emerald-600" />
                  <span>Expected Columns for {entityName}</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {fields.map((f) => (
                    <span
                      key={f.key}
                      className={`text-[11px] px-2 py-0.5 rounded border font-mono ${
                        f.required
                          ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      {f.label} {f.required && "*"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Column Mapping & Data Preview */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-emerald-900 font-medium">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>
                    Parsed <strong>{parsedRows.length}</strong> row(s) with <strong>{parsedHeaders.length}</strong> CSV column(s).
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={12} /> Change Source
                </button>
              </div>

              {/* Column Mapping Section */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase font-mono tracking-wider border-b border-slate-100 pb-2">
                  Map CSV Headers to {entityName} Fields
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {fields.map((f) => (
                    <div key={f.key} className="space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                          <span>{f.label}</span>
                          {f.required && <span className="text-rose-500 font-mono">*</span>}
                        </label>
                        {columnMapping[f.key] ? (
                          <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                            Mapped
                          </span>
                        ) : f.required ? (
                          <span className="text-[9px] font-mono font-bold text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded">
                            Required
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-slate-400">Optional</span>
                        )}
                      </div>

                      <select
                        value={columnMapping[f.key] || ""}
                        onChange={(e) => setColumnMapping({ ...columnMapping, [f.key]: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      >
                        <option value="">-- Ignore Field / Do Not Map --</option>
                        {parsedHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Preview Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 overflow-hidden">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase font-mono tracking-wider">
                  Live Preview (First {Math.min(5, parsedRows.length)} Rows)
                </h4>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead className="bg-slate-100 border-b border-slate-200 font-mono text-[10px] text-slate-600 uppercase">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        {fields.map((f) => (
                          <th key={f.key} className="py-2 px-3">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {parsedRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-[10px] text-slate-400">{idx + 1}</td>
                          {fields.map((f) => {
                            const csvCol = columnMapping[f.key];
                            const val = csvCol ? row[csvCol] : undefined;
                            return (
                              <td key={f.key} className="py-2 px-3 text-slate-800">
                                {val ? (
                                  <span>{val}</span>
                                ) : (
                                  <span className="text-slate-400 italic text-[10px]">
                                    {f.required ? "Missing" : "--"}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Complete Summary */}
          {step === 3 && importResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-4">
              <div className="bg-emerald-600 text-white w-14 h-14 rounded-full flex items-center justify-center mx-auto shadow-md">
                <Check size={28} />
              </div>

              <div>
                <h4 className="text-base font-extrabold text-emerald-950">
                  Import Process Completed!
                </h4>
                <p className="text-xs text-emerald-800 mt-1">
                  Successfully imported <strong>{importResult.successCount}</strong> record(s) into the {entityName} directory.
                </p>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-3 text-left text-xs font-mono space-y-1">
                  <p className="font-bold">Warnings / Skipped Rows:</p>
                  <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-md cursor-pointer transition-all"
                >
                  Done & Close Wizard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 flex items-center justify-between shrink-0">
          <div>
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                &larr; Back to Source
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Cancel
            </button>

            {step === 2 && (
              <button
                type="button"
                disabled={isImporting || parsedRows.length === 0}
                onClick={handleExecuteImport}
                className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-extrabold text-xs px-5 py-2 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer transition-all"
              >
                {isImporting ? <RefreshCw size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                <span>{isImporting ? "Importing Records..." : `Import ${parsedRows.length} Rows`}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
