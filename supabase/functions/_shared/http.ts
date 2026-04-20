export const JSON_HEADERS = { "Content-Type": "application/json" };

export function json(data: unknown, status = 200, extra?: HeadersInit): Response {
  const h = new Headers(JSON_HEADERS);
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => h.set(k, v));
  }
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export function mergeCors(res: Response): Response {
  const h = new Headers(res.headers);
  const c = new Headers(corsHeaders());
  c.forEach((v, k) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function readJsonBody(req: Request): Promise<unknown> {
  const t = await req.text();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    throw new Error("Invalid JSON");
  }
}
