import {
  api
} from "../shared/api.js";


const codeSection =
  document.querySelector(
    "#codeSection"
  );

const uploadSection =
  document.querySelector(
    "#uploadSection"
  );

const completeSection =
  document.querySelector(
    "#completeSection"
  );

const message =
  document.querySelector(
    "#message"
  );


const codeForm =
  document.querySelector(
    "#codeForm"
  );

const songUploadForm =
  document.querySelector(
    "#songUploadForm"
  );


const songFileInput =
  document.querySelector(
    "#songFile"
  );

const fileInfo =
  document.querySelector(
    "#fileInfo"
  );


function showCodeEntry() {

  codeSection.classList.remove(
    "hidden"
  );

  uploadSection.classList.add(
    "hidden"
  );

  completeSection.classList.add(
    "hidden"
  );
}


function showUploadForm() {

  codeSection.classList.add(
    "hidden"
  );

  uploadSection.classList.remove(
    "hidden"
  );

  completeSection.classList.add(
    "hidden"
  );
}


function showComplete() {

  codeSection.classList.add(
    "hidden"
  );

  uploadSection.classList.add(
    "hidden"
  );

  completeSection.classList.remove(
    "hidden"
  );
}


function showMessage(
  text,
  isError = false
) {

  message.textContent =
    text;

  message.classList.toggle(
    "error",
    isError
  );

  message.classList.toggle(
    "success",
    !isError && Boolean(text)
  );
}


/**
 * Show selected file information.
 */

songFileInput.addEventListener(
  "change",

  () => {

    const file =
      songFileInput.files?.[0];

    if (!file) {

      fileInfo.textContent =
        "";

      return;
    }


    const sizeMB =
      (
        file.size /
        1024 /
        1024
      ).toFixed(2);


    fileInfo.textContent =
      `${file.name} • ${sizeMB} MB`;
  }
);


/**
 * Validate upload code.
 */

codeForm.addEventListener(
  "submit",

  async event => {

    event.preventDefault();

    showMessage("");

    const submitButton =
      codeForm.querySelector(
        'button[type="submit"]'
      );

    const originalText =
      submitButton.textContent;

    submitButton.disabled =
      true;

    submitButton.textContent =
      "Checking...";


    try {

      const formData =
        new FormData(
          codeForm
        );

      const code =
        String(
          formData.get("code") || ""
        )
          .trim()
          .toUpperCase();


      await api(
        "/api/upload/access",

        {
          method: "POST",

          body:
            JSON.stringify({
              code
            })
        }
      );


      showUploadForm();


    } catch (error) {

      showMessage(
        error.message,
        true
      );

    } finally {

      submitButton.disabled =
        false;

      submitButton.textContent =
        originalText;
    }
  }
);


/**
 * Upload song.
 */

songUploadForm.addEventListener(
  "submit",

  async event => {

    event.preventDefault();

    showMessage("");

    const submitButton =
      songUploadForm.querySelector(
        'button[type="submit"]'
      );

    const originalText =
      submitButton.textContent;


    submitButton.disabled =
      true;

    submitButton.textContent =
      "Uploading...";


    try {

      const formData =
        new FormData(
          songUploadForm
        );


      await api(
        "/api/upload/submit",

        {
          method: "POST",

          body: formData
        }
      );


      showComplete();


    } catch (error) {

      showMessage(
        error.message,
        true
      );

      submitButton.disabled =
        false;

      submitButton.textContent =
        originalText;
    }
  }
);


/**
 * Initial state.
 */

showCodeEntry();