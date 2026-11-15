/**
 * The main page: the curve setup on the left and, on the right, three tabs for the three
 * tasks of the project: find all points, add two points, multiply a point by a scalar.
 */
import { useState } from 'react';
import { Card } from '../components/ui/Card.tsx';
import { TabPanel, Tabs, type TabItem } from '../components/ui/Tabs.tsx';
import { AddTab } from '../features/add/AddTab.tsx';
import { CurvePanel } from '../features/curve/CurvePanel.tsx';
import { MultiplyTab } from '../features/multiply/MultiplyTab.tsx';
import { PointsTab } from '../features/points/PointsTab.tsx';
import { usePageTitle } from '../lib/usePageTitle.ts';

type ExplorerTab = 'points' | 'add' | 'multiply';

const TABS: ReadonlyArray<TabItem<ExplorerTab>> = [
  { id: 'points', label: 'All points', icon: 'grid' },
  { id: 'add', label: 'Add points', icon: 'plus' },
  { id: 'multiply', label: 'Multiply', icon: 'close' },
];

/** The Explorer page. Its inputs and results live in the shared Explorer state. */
export function ExplorerPage() {
  usePageTitle('Explorer');
  const [tab, setTab] = useState<ExplorerTab>('points');

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Elliptic Curve Explorer</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Define a curve over a prime field, list its points, add two of them or multiply one by a
          scalar. Every result comes with the steps you would write by hand.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[76px]">
          <CurvePanel />
        </div>

        <Card as="section" aria-label="Operations on the curve" className="min-w-0 p-5">
          <Tabs
            items={TABS}
            active={tab}
            onChange={setTab}
            idPrefix="explorer"
            label="Operations"
          />
          <div className="mt-5">
            <TabPanel idPrefix="explorer" id="points" active={tab === 'points'}>
              <PointsTab />
            </TabPanel>
            <TabPanel idPrefix="explorer" id="add" active={tab === 'add'}>
              <AddTab />
            </TabPanel>
            <TabPanel idPrefix="explorer" id="multiply" active={tab === 'multiply'}>
              <MultiplyTab />
            </TabPanel>
          </div>
        </Card>
      </div>
    </div>
  );
}
