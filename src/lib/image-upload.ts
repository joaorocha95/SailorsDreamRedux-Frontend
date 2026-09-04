/**
 * What the picker will accept, and why it says no before the server does.
 *
 * The server decides an upload's format from its **bytes**, never from the filename or the
 * declared content type, and it stores JPEG and PNG and nothing else. So the honest place to
 * refuse a HEIC is the file picker: the common failure is an iPhone photograph, and "the uploaded
 * file is not an image" is a baffling thing to read about a photograph you can see.
 *
 * That settles the roadmap's open question the same way for listing photographs as the avatar
 * already settled it — reject at the picker, with a sentence saying what to do instead. Converting
 * on a canvas was the alternative: it would need a HEIC decoder the browser does not ship, so it
 * means shipping one, and a several-hundred-kilobyte dependency to rescue a file the person can
 * re-export in two taps is the wrong trade.
 */

/** The two formats `ImageFormat.detect` will match. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png']

/** `images.upload.max-bytes` on the server. The container's own cap sits above it, deliberately. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/**
 * Why this file cannot be uploaded, or null if it can.
 *
 * A message rather than a boolean: both refusals need to say something specific, and a caller
 * that only learns "no" would have to reconstruct which of the two it was.
 */
export function imageRejection(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return (
      'Only JPEG and PNG can be uploaded. iPhone photos are often HEIC — choose “Most Compatible” ' +
      'in Camera settings, or export the picture as JPEG first.'
    )
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return `That picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`
  }

  return null
}
