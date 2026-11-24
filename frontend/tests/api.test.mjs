import { test } from "node:test";
import assert from "node:assert/strict";
import api, { attachAuthToken, setAuthToken } from "../src/services/api.ts";

test("requests obtain the current token and cleanup removes stale credentials", async () => {
  const headers = [];
  const adapter = async config => {
    headers.push(config.headers.get("Authorization"));
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
  let token = "first-token";
  const detach = attachAuthToken(async () => token);
  try {
    await api.get("/parishes/", { adapter });
    token = "renewed-token";
    await api.get("/parishes/", { adapter });
    setAuthToken("stale-token");
  } finally {
    detach();
  }
  await api.get("/parishes/", { adapter });
  assert.deepEqual(headers, ["Bearer first-token", "Bearer renewed-token", undefined]);
});

test("a failed token renewal does not send an unauthenticated request", async () => {
  let sent = false;
  const detach = attachAuthToken(async () => { throw new Error("session expired"); });
  try {
    await assert.rejects(api.get("/parishes/", { adapter: async () => { sent = true; } }), /session expired/);
    assert.equal(sent, false);
  } finally {
    detach();
  }
});
