import { api } from "../shared/api.js";

const MAX_AUDIO_SIZE = 50 * 1024 * 1024;

const codeSection = document.querySelector("#codeSection");
const uploadSection = document.querySelector("#uploadSection");
const completeSection = document.querySelector("#completeSection");
const message = document.querySelector("#message");
const codeForm = document.querySelector("#codeForm");
const songUploadForm = document.querySelector("#songUploadForm");
const songFileInput = document.querySelector("#songFile");
const fileInfo = document.querySelector("#fileInfo");

function showCodeEntry() {
  codeSection.classList.remove("hidden");
  uploadSection.classList.add("hidden");
  completeSection.classList.add("hidden");
}

function showUploadForm() {
  codeSection.classList.add("hidden");
  uploadSection.classList.remove("hidden");
  completeSection.classList.add("hidden");
}

function showComplete() {
  codeSection.classList.add("hidden");
  uploadSection.classList.add("hidden");
  completeSection.classList.remove("hidden");
}

function showMessage(text, isError = false) {
  message.textContent = text || "";
  message.classList.toggle("error", isError);
  message.classList.toggle("success", !isError && Boolean(text));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

songFileInput.addEventListener("change", () => {
  const file = songFileInput.files?.[0];

  if (!file) {
    fileInfo.textContent = "No file selected";
    return;
  }

  fileInfo.textContent = `${file.name} • ${formatBytes(file.size)}`;

  if (file.size > MAX_AUDIO_SIZE) {
    showMessage("That file is larger than 50 MB. Choose a smaller audio file.", true);
  } else {
    showMessage("");
  }
});

codeForm.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("");

  const submitButton = codeForm.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent = "Checking…";

  try {
    const code = String(
      new FormData(codeForm).get("code") || ""
    ).trim().toUpperCase();

    await api("/api/upload/access", {
      method: "POST",
      body: { code }
    });

    showUploadForm();
    showMessage("Code accepted. Choose your song.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
});

songUploadForm.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("");

  const submitButton = songUploadForm.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  const formData = new FormData(songUploadForm);
  const file = formData.get("file");

  if (!file || typeof file.size !== "number" || file.size <= 0) {
    showMessage("Choose an audio file first.", true);
    return;
  }

  if (file.size > MAX_AUDIO_SIZE) {
    showMessage("Audio files must be smaller than 50 MB.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Uploading…";

  try {
    await api("/api/upload/submit", {
      method: "POST",
      body: formData
    });

    showComplete();
    showMessage("Song submitted successfully.");
  } catch (error) {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
    showMessage(error.message, true);
  }
});

async function restoreSession() {
  try {
    const session = await api("/api/upload/session");

    if (session.active) {
      showUploadForm();
      return;
    }

    if (session.used) {
      showComplete();
      return;
    }
  } catch (error) {
    showMessage(error.message, true);
  }

  showCodeEntry();
}

restoreSession();
