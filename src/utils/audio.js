export const MAX_AUDIO_SIZE =
  50 * 1024 * 1024;


const ALLOWED_EXTENSIONS =
  new Set([
    "mp3",
    "wav",
    "m4a",
    "webm"
  ]);


export function validateAudioFile(
  file
) {

  if (
    !file ||
    typeof file.arrayBuffer !== "function"
  ) {

    const error =
      new Error(
        "An audio file is required"
      );

    error.status = 400;

    throw error;
  }


  if (file.size <= 0) {

    const error =
      new Error(
        "The selected file is empty"
      );

    error.status = 400;

    throw error;
  }


  if (
    file.size >
    MAX_AUDIO_SIZE
  ) {

    const error =
      new Error(
        "Audio files must be smaller than 50 MB"
      );

    error.status = 413;

    throw error;
  }


  const extension =
    getAudioExtension(file);


  if (
    !extension ||
    !ALLOWED_EXTENSIONS.has(
      extension
    )
  ) {

    const error =
      new Error(
        "Unsupported audio file type"
      );

    error.status = 400;

    throw error;
  }


  return true;
}


export function getAudioExtension(
  file
) {

  const filename =
    String(
      file?.name || ""
    );


  const extension =
    filename
      .split(".")
      .pop()
      ?.toLowerCase();


  return extension || "";
}