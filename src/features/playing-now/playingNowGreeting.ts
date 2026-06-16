import type { AppLanguage } from '../../i18n';
import { sanitizeShelfNickname } from '../../lib/shelfIdentity';

export type PlayingNowTimeBucket = 'morning' | 'day' | 'evening' | 'lateNight';

const greetingPools: Record<AppLanguage, Record<PlayingNowTimeBucket, string[]>> = {
  en: {
    morning: ['Good morning, {name}. What are we playing today?', 'Morning, {name}. Your backlog survived the night.', 'Good morning. One game before real life?', 'New day, same backlog. What is first?'],
    day: ['Welcome back, {name}. What are you in the mood for?', 'Good to see you, {name}. Pick your next run.', 'A quick session sounds reasonable.', 'What deserves your attention today?'],
    evening: ['Welcome back, {name}. What are we playing tonight?', 'Evening mode engaged. Choose your quest.', 'One more game? Classic.', 'The day is done. The backlog is not.'],
    lateNight: ['Still awake, {name}? Dangerous territory.', 'One more game before sleep. Surely.', '3:15. Something is going to happen.', 'Your future self may question this decision.'],
  },
  cs: {
    morning: ['Dobré ráno, {name}. Co dnes rozehraješ?', 'Ráno, {name}. Backlog přežil další noc.', 'Nový den, stejná polička. Čím začneš?', 'Než začne realita… jedna hra?'],
    day: ['Vítej zpátky, {name}. Na co máš dnes náladu?', 'Rád tě vidím, {name}. Co si dáš dál?', 'Rychlá session zní rozumně.', 'Co si dnes zaslouží pozornost?'],
    evening: ['Vítej zpátky, {name}. Co si dnes večer zahraješ?', 'Večerní režim zapnut. Vyber quest.', 'Ještě jedna hra? Klasika.', 'Den končí. Backlog ne.'],
    lateNight: ['Ještě vzhůru, {name}? Nebezpečná zóna.', 'Ještě jedna hra před spaním. Určitě.', '3:15. Něco se stane.', 'Tvoje ranní já to možná zpochybní.'],
  },
};

const easterEggPools: Record<AppLanguage, string[]> = {
  en: ['Achievement unlocked: opened QuestShelf.', 'The backlog is not judging you. Yet.', 'Quest Queue is watching.', 'Today is a perfect day to ignore the wishlist.', 'Just browsing. Famous last words.', 'Saving the world can wait. Unless it is in your backlog.'],
  cs: ['Achievement odemčen: otevřen QuestShelf.', 'Backlog tě nehodnotí. Zatím.', 'Quest Queue tě sleduje.', 'Ideální den ignorovat wishlist.', 'Jen se podívám. Slavná poslední slova.', 'Záchrana světa počká. Pokud není v backlogu.'],
};

export function getPlayingNowTimeBucket(date: Date): PlayingNowTimeBucket {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 10) return 'morning';
  if (hour >= 11 && hour <= 16) return 'day';
  if (hour >= 17 && hour <= 22) return 'evening';
  return 'lateNight';
}

export function createPlayingNowGreeting({ date = new Date(), language, nickname }: { date?: Date; language: AppLanguage; nickname?: string | null }) {
  const seed = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${getPlayingNowTimeBucket(date)}-${language}-${sanitizeShelfNickname(nickname)}`;
  const hash = hashString(seed);
  const pool = hash % 100 < 4 ? easterEggPools[language] : greetingPools[language][getPlayingNowTimeBucket(date)];
  const template = pool[hash % pool.length];
  const name = sanitizeShelfNickname(nickname);
  return name ? template.replace('{name}', name) : template.replace(/,?\s*\{name\}/g, '').replace(/\s{2,}/g, ' ').trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}
