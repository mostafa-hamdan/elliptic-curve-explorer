/**
 * One "Learn ECC" topic page, such as /learn/point-addition: a short article with a worked
 * example, a button that opens the same example in the Explorer, and links to the
 * previous and next topics. The text lives in features/learn/topics.tsx.
 */
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../components/ui/Button.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { useExplorer } from '../features/explorer/ExplorerContext.tsx';
import { LEARN_TOPICS, findTopic } from '../features/learn/topics.tsx';
import { EXPLORER_PATH } from '../lib/paths.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

/** The topic page; an unknown topic shows the usual "Page not found". */
export function LearnTopicPage() {
  const { topic: slug } = useParams();
  const topic = findTopic(slug);
  usePageTitle(topic ? topic.title : 'Page not found');
  const navigate = useNavigate();
  const explorer = useExplorer();

  if (!topic) return <NotFoundPage />;

  const index = LEARN_TOPICS.indexOf(topic);
  const previous = LEARN_TOPICS[index - 1];
  const next = LEARN_TOPICS[index + 1];

  /** Load this topic's example curve and open the matching Explorer tab. */
  function tryIt() {
    if (!topic) return;
    explorer.applyPreset(topic.preset);
    if (topic.scalar !== undefined) explorer.setScalar(topic.scalar);
    explorer.setTab(topic.tab);
    navigate(EXPLORER_PATH);
  }

  return (
    <article className="mx-auto max-w-3xl" data-testid="learn-topic">
      <nav aria-label="Breadcrumb" className="text-note text-muted">
        <Link to="/#learn" className="font-medium text-primary hover:underline">
          Learn ECC
        </Link>
        <span aria-hidden="true"> / </span>
        <span>
          Topic {index + 1} of {LEARN_TOPICS.length}
        </span>
      </nav>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {topic.title}
      </h1>
      <p className="mt-3 text-lg text-ink-soft">{topic.summary}</p>

      <div className="mt-6 space-y-3 leading-relaxed text-ink-soft">{topic.body()}</div>

      <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="font-semibold text-ink">Try it yourself</p>
          <p className="text-sm text-muted">
            Opens this example in the Explorer, with every step shown.
          </p>
        </div>
        <Button variant="primary" icon="play" onClick={tryIt}>
          Open in the Explorer
        </Button>
      </Card>

      <nav
        aria-label="More topics"
        className="mt-6 grid gap-3 sm:grid-cols-2"
        data-testid="topic-pager"
      >
        {previous ? (
          <Link
            to={`/learn/${previous.slug}`}
            className="group rounded-xl border border-line bg-surface p-4 hover:border-primary/50"
          >
            <span className="flex items-center gap-1 text-note text-muted">
              <Icon name="chevronLeft" size={14} /> Previous
            </span>
            <span className="mt-1 block font-medium text-ink group-hover:text-primary">
              {previous.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            to={`/learn/${next.slug}`}
            className="group rounded-xl border border-line bg-surface p-4 text-right hover:border-primary/50"
          >
            <span className="flex items-center justify-end gap-1 text-note text-muted">
              Next <Icon name="chevronRight" size={14} />
            </span>
            <span className="mt-1 block font-medium text-ink group-hover:text-primary">
              {next.title}
            </span>
          </Link>
        )}
      </nav>
    </article>
  );
}
