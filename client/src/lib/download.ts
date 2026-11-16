/**
 * Saving files from the browser: hands a piece of text or an image to the browser as a
 * download, the same way a "Save as" link would. Nothing leaves the computer.
 */

/**
 * Offer a file to the user as a download.
 *
 * @param blob - the file contents.
 * @param filename - the suggested file name.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the address is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Offer text (for example CSV) as a download. A byte-order mark is added so Excel reads
 * the special characters (≡, ·, ²) correctly.
 *
 * @param text - the file contents.
 * @param filename - the suggested file name.
 * @param type - the media type, CSV by default.
 */
export function downloadText(text: string, filename: string, type = 'text/csv'): void {
  downloadBlob(new Blob(['﻿', text], { type: `${type};charset=utf-8` }), filename);
}

/**
 * Save a canvas as a PNG picture on a solid background, so it reads well in any image
 * viewer (the canvas itself has transparent margins).
 *
 * @param canvas - the drawing.
 * @param background - the colour to put behind it.
 * @param filename - the suggested file name.
 * @returns a promise that settles once the file has been handed to the browser.
 * @throws when the browser cannot turn the drawing into a picture.
 */
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  background: string,
  filename: string,
): Promise<void> {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext('2d');
  if (!context) throw new Error('This browser cannot create pictures.');
  context.fillStyle = background;
  context.fillRect(0, 0, copy.width, copy.height);
  context.drawImage(canvas, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => copy.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The picture could not be created.');
  downloadBlob(blob, filename);
}
