import { Button } from './ui';

export interface BoardControlsProps {
  onStart(): void;
  onBack(): void;
  onForward(): void;
  onEnd(): void;
  onFlip?(): void;
  canBack: boolean;
  canForward: boolean;
}

/** Rewind / step / flip controls, sized for thumbs on a phone. */
export function BoardControls({
  onStart,
  onBack,
  onForward,
  onEnd,
  onFlip,
  canBack,
  canForward,
}: BoardControlsProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="secondary" onClick={onStart} disabled={!canBack} aria-label="Go to start" className="px-3">
        ⏮
      </Button>
      <Button variant="secondary" onClick={onBack} disabled={!canBack} aria-label="Previous move" className="px-3">
        ◀
      </Button>
      <Button variant="secondary" onClick={onForward} disabled={!canForward} aria-label="Next move" className="px-3">
        ▶
      </Button>
      <Button variant="secondary" onClick={onEnd} disabled={!canForward} aria-label="Go to end" className="px-3">
        ⏭
      </Button>
      {onFlip ? (
        <Button variant="ghost" onClick={onFlip} aria-label="Flip board" className="px-3">
          ⇅
        </Button>
      ) : null}
    </div>
  );
}
