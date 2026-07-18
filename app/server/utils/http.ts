export function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return jsonResponse({ error: message }, { status });
}
