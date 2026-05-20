"use client";

/**
 * Convert array of records to CSV string.
 * - Escapes quotes, commas, newlines per RFC 4180
 * - Uses keys of first row as header
 */
export function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

/**
 * Trigger browser download of a string as a file.
 */
export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv<T extends Record<string, unknown>>(filename: string, rows: T[]) {
  downloadFile(filename, toCsv(rows), "text/csv;charset=utf-8");
}

export function downloadJson(filename: string, data: unknown) {
  downloadFile(filename, JSON.stringify(data, null, 2), "application/json");
}
