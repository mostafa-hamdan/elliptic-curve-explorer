/**
 * Sets the browser tab title for a page, so each page is recognisable in the tab bar
 * and in the browser history.
 */
import { useEffect } from 'react';

/**
 * Set the tab title to "<page> · OnCurve" while the page is shown.
 *
 * @param page - short page name, for example "Limitations".
 */
export function usePageTitle(page: string): void {
  useEffect(() => {
    document.title = `${page} · OnCurve`;
  }, [page]);
}
