// Raster formats the API accepts for profile/logo uploads (audit H4:
// mimes:jpeg,jpg,png,webp) — SVG and anything scriptable stay out.
export const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
// 2 MB, matching the API's max:2048 rule.
export const maxImageBytes = 2 * 1024 * 1024;

/** Why a chosen file cannot be uploaded, or null when it can. */
export function imageProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!validImageTypes.includes(file.type)) {
    return 'Only JPEG, PNG or WebP images are allowed.';
  }
  if (file.size > maxImageBytes) {
    return 'Please upload an image smaller than 2 MB.';
  }
  return null;
}
