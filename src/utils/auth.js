const encoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function stringToBase64Url(value) {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToString(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

export async function hashPassword(password, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 150000
    },
    key,
    256
  );

  return {
    salt,
    hash: bytesToBase64Url(new Uint8Array(bits))
  };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  return hash === expectedHash;
}

export async function createSessionToken(user, secret, ttlSeconds = 60 * 60 * 12) {
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };

  const encodedPayload = stringToBase64Url(JSON.stringify(payload));
  const signature = await hmac(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || !secret) return null;

  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;

  const expected = await hmac(payloadPart, secret);
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(base64UrlToString(payloadPart));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }

  return null;
}

export function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
