import { isAxiosError } from "axios";

export function filenameFromDisposition(header: unknown, fallback: string): string {
  const match = typeof header === "string" ? /filename="?([^";]+)"?/i.exec(header) : null;
  return match?.[1] || fallback;
}

// Blob requests receive the API's JSON error body as a Blob, which errorDetail can't read.
export async function blobErrorMessage(error: unknown, fallback: string): Promise<string> {
  const data: unknown = isAxiosError(error) ? error.response?.data : undefined;
  if (data instanceof Blob) {
    try {
      const detail: unknown = JSON.parse(await data.text()).detail;
      if (typeof detail === "string") return detail;
    } catch {
      // Not a JSON error body; fall through to the generic message.
    }
  }
  return fallback;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
