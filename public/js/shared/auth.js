import { api } from "./api.js";

export async function getCurrentUser() {
  const result = await api("/api/auth/me");
  return result.user;
}

export async function login(username, password) {
  const result = await api("/api/auth/login", {
    method: "POST",
    body: { username, password }
  });

  return result.user;
}

export async function logout() {
  await api("/api/auth/logout", { method: "POST" });
}
