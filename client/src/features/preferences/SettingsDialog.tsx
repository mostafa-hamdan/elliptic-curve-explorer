/**
 * The display settings dialog: theme, text size, and links to the keyboard shortcuts and
 * the guided tour. Changes apply at once and are remembered in this browser.
 */
import { Button } from '../../components/ui/Button.tsx';
import { ChoiceGroup } from '../../components/ui/ChoiceGroup.tsx';
import { Dialog } from '../../components/ui/Dialog.tsx';
import { useShell } from '../shell/ShellContext.tsx';
import { useTutorial } from '../tutorial/TutorialContext.tsx';
import { TEXT_SIZES, usePreferences, type Theme } from './PreferencesContext.tsx';

const THEMES: ReadonlyArray<{ id: Theme; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** The settings dialog, opened from the sliders button in the top bar. */
export function SettingsDialog() {
  const { panel, closePanel, openPanel } = useShell();
  const { theme, setTheme, textSize, setTextSize } = usePreferences();
  const tutorial = useTutorial();

  return (
    <Dialog
      open={panel === 'settings'}
      onClose={closePanel}
      title="Display settings"
      description="Changes apply at once and are remembered in this browser."
      testId="settings-dialog"
      footer={
        <Button variant="primary" onClick={closePanel}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        <ChoiceGroup legend="Theme" options={THEMES} value={theme} onChange={setTheme} />
        <ChoiceGroup
          legend="Text size"
          options={TEXT_SIZES}
          value={textSize}
          onChange={setTextSize}
          testId="text-size"
        />
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button
            icon="play"
            onClick={() => {
              closePanel();
              tutorial.start();
            }}
          >
            Show the guided tour
          </Button>
          <Button icon="keyboard" onClick={() => openPanel('shortcuts')}>
            Keyboard shortcuts
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
