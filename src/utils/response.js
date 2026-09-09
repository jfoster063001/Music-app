export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export function badRequest(message) {
  return json({ error: message }, 400);
}

export function unauthorized(message = "Authentication required") {
  return json({ error: message }, 401);
}

export function forbidden(message = "You do not have permission to do that") {
  return json({ error: message }, 403);
}

export function notFound(message = "Not found") {
  return json({ error: message }, 404);
}
