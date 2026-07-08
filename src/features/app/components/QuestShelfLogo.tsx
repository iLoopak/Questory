import { useState } from 'react';

const appLogo = '/icons/questshelf-icon.png';

export function QuestShelfLogo({ className, fallbackClassName = 'text-2xs' }: { className: string; fallbackClassName?: string }) {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden bg-ink-950 text-mint shadow-glow ${className}`} aria-hidden="true">
      {hasImageError ? (
        <span className={`font-semibold leading-none ${fallbackClassName}`}>Questory</span>
      ) : (
        <img className="qs-logo-glow h-full w-full object-cover" src={appLogo} alt="" onError={() => setHasImageError(true)} />
      )}
    </div>
  );
}
