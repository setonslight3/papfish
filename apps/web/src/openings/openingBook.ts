import { OpeningBook, type OpeningBookData } from '@papfish/core';

let bookPromise: Promise<OpeningBook> | null = null;

/**
 * Load the opening-name book produced by the pipeline.
 *
 * It is fetched once per session and cached by the service worker, so opening
 * recognition costs one small download rather than shipping inside the bundle.
 */
export function loadOpeningBook(): Promise<OpeningBook> {
  if (!bookPromise) {
    bookPromise = fetch('/data/openings.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Opening book unavailable (${response.status})`);
        return response.json() as Promise<OpeningBookData>;
      })
      .then((data) => new OpeningBook(data))
      .catch((error: unknown) => {
        console.warn('[papfish] opening book failed to load', error);
        return OpeningBook.empty();
      });
  }
  return bookPromise;
}

export function __resetOpeningBookForTests(): void {
  bookPromise = null;
}
