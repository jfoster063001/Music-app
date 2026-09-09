function normalizeSecret(value) {
  return String(value || "").trim();
}

export function requireSecret(
  request,
  env,
  {
    envKey,
    headerName,
    label = "secret"
  }
) {
  const configuredSecret = normalizeSecret(
    env[envKey]
  );

  if (!configuredSecret) {
    const error = new Error(
      `${envKey} is not configured`
    );

    error.status = 500;

    throw error;
  }

  const providedSecret = normalizeSecret(
    request.headers.get(headerName)
  );

  if (!providedSecret) {
    const error = new Error(
      `${label} is required`
    );

    error.status = 403;

    throw error;
  }

  if (providedSecret !== configuredSecret) {
    const error = new Error(
      `Invalid ${label}`
    );

    error.status = 403;

    throw error;
  }

  return true;
}