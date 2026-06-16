import type { AppLanguage } from '../../i18n';
import { sanitizeShelfNickname } from '../../lib/shelfIdentity';
import type { ContextualGreeting } from './contextualGreetings';

export type PlayingNowTimeBucket = 'morning' | 'day' | 'evening' | 'lateNight';
export type PlayingNowGreeting = {
  headline: string;
  subtext: string;
};

type GreetingTemplate = {
  headline: string;
  subtext: string;
};

const greetingPools: Record<AppLanguage, Record<PlayingNowTimeBucket, GreetingTemplate[]>> = {
  en: {
    morning: [
      { headline: 'Good morning, {name}.', subtext: 'What are we playing today?' },
      { headline: 'Morning, {name}.', subtext: 'Your backlog survived the night.' },
      { headline: 'Good morning.', subtext: 'One game before real life?' },
      { headline: 'Morning check-in.', subtext: 'What is first?' },
    ],
    day: [
      { headline: 'Welcome back, {name}.', subtext: 'What are you in the mood for?' },
      { headline: 'Good to see you, {name}.', subtext: 'Pick your next run.' },
      { headline: 'Welcome back.', subtext: 'A quick session sounds reasonable.' },
      { headline: 'Good to see you.', subtext: 'What deserves your attention today?' },
    ],
    evening: [
      { headline: 'Welcome back, {name}.', subtext: 'What are we playing tonight?' },
      { headline: 'Evening mode engaged.', subtext: 'Choose your quest.' },
      { headline: 'Good evening.', subtext: 'Classic.' },
      { headline: 'Evening check-in.', subtext: 'The backlog is not done.' },
    ],
    lateNight: [
      { headline: 'Still awake, {name}?', subtext: 'Dangerous territory.' },
      { headline: 'Still awake?', subtext: 'Surely just one more game.' },
      { headline: 'Late-night check-in.', subtext: 'Something is going to happen.' },
      { headline: 'Still here?', subtext: 'Your future self may question this decision.' },
    ],
  },
  cs: {
    morning: [
      { headline: 'Dobré ráno, {name}.', subtext: 'Co dnes rozehraješ?' },
      { headline: 'Dobré ráno, {name}.', subtext: 'Backlog přežil další noc.' },
      { headline: 'Dobré ráno.', subtext: 'Čím začneš?' },
      { headline: 'Ranní kontrola.', subtext: 'Jedna hra?' },
    ],
    day: [
      { headline: 'Vítej zpátky, {name}.', subtext: 'Na co máš dnes náladu?' },
      { headline: 'Rád tě vidím, {name}.', subtext: 'Co si dáš dál?' },
      { headline: 'Vítej zpátky.', subtext: 'Rychlá session zní rozumně.' },
      { headline: 'Rád tě vidím.', subtext: 'Co si dnes zaslouží pozornost?' },
    ],
    evening: [
      { headline: 'Vítej zpátky, {name}.', subtext: 'Co si dnes večer zahraješ?' },
      { headline: 'Večerní režim zapnut.', subtext: 'Vyber quest.' },
      { headline: 'Dobrý večer.', subtext: 'Klasika.' },
      { headline: 'Večerní kontrola.', subtext: 'Backlog nekončí.' },
    ],
    lateNight: [
      { headline: 'Ještě vzhůru, {name}?', subtext: 'Nebezpečná zóna.' },
      { headline: 'Ještě vzhůru?', subtext: 'Určitě jen jedna hra.' },
      { headline: 'Noční kontrola.', subtext: 'Něco se stane.' },
      { headline: 'Pořád tady?', subtext: 'Tvoje ranní já to možná zpochybní.' },
    ],
  },
};

const easterEggSubtextPools: Record<AppLanguage, string[]> = {
  en: [
    'Achievement unlocked: opened QuestShelf.',
    'The backlog is not judging you. Yet.',
    'Quest Queue is watching.',
    'Today is a perfect day to ignore the wishlist.',
    'Just browsing. Famous last words.',
    'Saving the world can wait. Unless it is in your backlog.',
  ],
  cs: [
    'Achievement odemčen: otevřen QuestShelf.',
    'Backlog tě nehodnotí. Zatím.',
    'Quest Queue tě sleduje.',
    'Ideální den ignorovat wishlist.',
    'Jen se podívám. Slavná poslední slova.',
    'Záchrana světa počká. Pokud není v backlogu.',
  ],
};

export function getPlayingNowTimeBucket(date: Date): PlayingNowTimeBucket {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 10) return 'morning';
  if (hour >= 11 && hour <= 16) return 'day';
  if (hour >= 17 && hour <= 22) return 'evening';
  return 'lateNight';
}

export function createPlayingNowGreeting({ contextualGreeting, date = new Date(), language, nickname }: { contextualGreeting?: ContextualGreeting | null; date?: Date; language: AppLanguage; nickname?: string | null }): PlayingNowGreeting {
  const name = sanitizeShelfNickname(nickname);
  const timeBucket = getPlayingNowTimeBucket(date);
  const seed = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${timeBucket}-${language}-${name}`;
  const hash = hashString(seed);
  const greetingPool = greetingPools[language][timeBucket];
  const headlineTemplate = greetingPool[hash % greetingPool.length];
  const genericSubtext = selectGenericSubtext({ date, hash, language, name, timeBucket });

  return {
    headline: formatTemplateText(headlineTemplate.headline, name),
    subtext: contextualGreeting?.subtext ?? genericSubtext,
  };
}

function selectGenericSubtext({ date, hash, language, name, timeBucket }: { date: Date; hash: number; language: AppLanguage; name: string; timeBucket: PlayingNowTimeBucket }) {
  const subtexts = greetingPools[language][timeBucket]
    .map((template) => template.subtext)
    .filter((subtext) => subtext.trim().length > 0);
  const pool = hash % 100 < 4 ? [...subtexts, ...easterEggSubtextPools[language]] : subtexts;
  if (pool.length === 0) return '';
  const subtextHash = hashString(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${timeBucket}-${language}-${name}-subtext`);
  return formatTemplateText(pool[subtextHash % pool.length], name);
}

function formatTemplateText(value: string, name: string) {
  return name ? value.replace('{name}', name) : value.replace(/,?\s*\{name\}/g, '').replace(/\s{2,}/g, ' ').trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}
