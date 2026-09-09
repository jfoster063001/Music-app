export async function api(path, options = {}) {
  const requestOptions = {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.headers || {})
    }
  };

  if (
    requestOptions.body &&
    !(requestOptions.body instanceof FormData) &&
    typeof requestOptions.body !== "string"
  ) {
    requestOptions.headers["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  const response = await fetch(path, requestOptions);
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(data?.error || data || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
