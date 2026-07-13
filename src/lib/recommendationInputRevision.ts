type RecommendationInputListener = () => void;

let revision = 0;
const listeners = new Set<RecommendationInputListener>();

export function getRecommendationInputRevision(): number {
  return revision;
}

export function subscribeRecommendationInputRevision(listener: RecommendationInputListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateRecommendationInputRevision(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

