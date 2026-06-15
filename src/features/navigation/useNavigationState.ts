import { useAppNavigation } from '../../hooks/useAppNavigation';
import type { TopNavItem } from '../../config/navigation';

type UseNavigationStateOptions = {
  onSectionChange: () => void;
};

export function useNavigationState(options: UseNavigationStateOptions) {
  return useAppNavigation(options);
}

export type { TopNavItem };
