import type { OpeningIdentification } from '@papfish/core';
import { Badge } from './ui';

/**
 * The detected opening for the current position. The user never names an
 * opening by hand - it is recognised from the position itself.
 */
export function OpeningBadge({
  identification,
  className,
}: {
  identification: OpeningIdentification | null;
  className?: string;
}): React.JSX.Element {
  if (!identification) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-400">Starting position</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{identification.eco}</Badge>
        <p className="text-sm font-semibold text-slate-100">{identification.opening}</p>
      </div>
      {identification.variation ? (
        <p className="mt-0.5 text-xs text-slate-400">{identification.variation}</p>
      ) : null}
    </div>
  );
}
