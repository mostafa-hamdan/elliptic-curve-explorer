/**
 * Shown for any address that is not a page of the app, with a way back.
 */
import { Link } from 'react-router';
import { Card } from '../components/ui/Card.tsx';
import { EXPLORER_PATH } from '../lib/paths.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';

/** The "page not found" screen. */
export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <p className="font-mono text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 text-muted">
        This address is not a point on our curve. The Explorer is the place to start.
      </p>
      <Link
        to={EXPLORER_PATH}
        className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover"
      >
        Go to the Explorer
      </Link>
    </Card>
  );
}
