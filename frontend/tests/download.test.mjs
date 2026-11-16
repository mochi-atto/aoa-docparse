import { test } from "node:test";
import assert from "node:assert/strict";
import { AxiosError } from "axios";
import { blobErrorMessage, filenameFromDisposition } from "../src/services/download.ts";

test("export filename comes from Content-Disposition, with a fallback", () => {
  assert.equal(filenameFromDisposition('attachment; filename="St_Marys_export_2026-11-16.xlsx"', "x.xlsx"), "St_Marys_export_2026-11-16.xlsx");
  assert.equal(filenameFromDisposition("attachment; filename=plain.xlsx", "x.xlsx"), "plain.xlsx");
  assert.equal(filenameFromDisposition(undefined, "x.xlsx"), "x.xlsx");
});

function blobError(body, status) {
  const response = { data: new Blob([body]), status, statusText: "", headers: {}, config: { headers: {} } };
  return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, response);
}

test("export errors show the API's detail instead of a raw status code", async () => {
  assert.equal(await blobErrorMessage(blobError('{"detail":"You don\'t have access to this parish"}', 403), "fallback"),
    "You don't have access to this parish");
  assert.equal(await blobErrorMessage(blobError("Internal Server Error", 500), "fallback"), "fallback");
  assert.equal(await blobErrorMessage(new Error("Network Error"), "fallback"), "fallback");
});
