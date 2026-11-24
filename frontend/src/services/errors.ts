import { isAxiosError } from "axios";

export function errorDetail(error: unknown): string | undefined {
  if (isAxiosError<{ detail?: unknown }>(error) && typeof error.response?.data.detail === "string") return error.response.data.detail;
  return error instanceof Error ? error.message : undefined;
}
