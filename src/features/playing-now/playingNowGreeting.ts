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
      { headline: 'New day, same backlog.', subtext: 'What is first?' },
    ],
    day: [
      { headline: 'Welcome back, {name}.', subtext: 'What are you in the mood for?' },
      { headline: 'Good to see you, {name}.', subtext: 'Pick your next run.' },
      { headline: 'A quick session sounds reasonable.', subtext: '' },
      { headline: 'What deserves your attention today?', subtext: '' },
    ],
    evening: [
      { headline: 'Welcome back, {name}.', subtext: 'What are we playing tonight?' },
      { headline: 'Evening mode engaged.', subtext: 'Choose your quest.' },
      { headline: 'One more game?', subtext: 'Classic.' },
      { headline: 'The day is done.', subtext: 'The backlog is not.' },
    ],
    lateNight: [
      { headline: 'Still awake, {name}?', subtext: 'Dangerous territory.' },
      { headline: 'One more game before sleep.', subtext: 'Surely.' },
      { headline: '3:15.', subtext: 'Something is going to happen.' },
      { headline: 'Your future self may question this decision.', subtext: '' },
    ],
  },
  cs: {
    morning: [
      { headline: 'Dobré ráno, {name}.', subtext: 'Co dnes rozehraješ?' },
      { headline: 'Dobré ráno, {name}.', subtext: 'Backlog přežil další noc.' },
      { headline: 'Nový den, stejná polička.', subtext: 'Čím začneš?' },
      { headline: 'Než začne realita…', subtext: 'Jedna hra?' },
    ],
    day: [
      { headline: 'Vítej zpátky, {name}.', subtext: 'Na co máš dnes náladu?' },
      { headline: 'Rád tě vidím, {name}.', subtext: 'Co si dáš dál?' },
      { headline: 'Rychlá session zní rozumně.', subtext: '' },
      { headline: 'Co si dnes zaslouží pozornost?', subtext: '' },
    ],
    evening: [
      { headline: 'Vítej zpátky, {name}.', subtext: 'Co si dnes večer zahraješ?' },
      { headline: 'Večerní režim zapnut.', subtext: 'Vyber quest.' },
      { headline: 'Ještě jedna hra?', subtext: 'Klasika.' },
      { headline: 'Den končí.', subtext: 'Backlog ne.' },
    ],
    lateNight: [
      { headline: 'Ještě vzhůru, {name}?', subtext: 'Nebezpečná zóna.' },
      { headline: 'Ještě jedna hra před spaním.', subtext: 'Určitě.' },
      { headline: '3:15.', subtext: 'Něco se stane.' },
      { headline: 'Tvoje ranní já to možná zpochybní.', subtext: '' },
    ],
  },
};

const easterEggPools: Record<AppLanguage, GreetingTemplate[]> = {
  en: [
    { headline: 'Achievement unlocked:', subtext: 'opened QuestShelf.' },
    { headline: 'The backlog is not judging you.', subtext: 'Yet.' },
    { headline: 'Quest Queue is watching.', subtext: '' },
    { headline: 'Today is a perfect day', subtext: 'to ignore the wishlist.' },
    { headline: 'Just browsing.', subtext: 'Famous last words.' },
    { headline: 'Saving the world can wait.', subtext: 'Unless it is in your backlog.' },
  ],
  cs: [
    { headline: 'Achievement odemčen:', subtext: 'otevřen QuestShelf.' },
    { headline: 'Backlog tě nehodnotí.', subtext: 'Zatím.' },
    { headline: 'Quest Queue tě sleduje.', subtext: '' },
    { headline: 'Ideální den', subtext: 'ignorovat wishlist.' },
    { headline: 'Jen se podívám.', subtext: 'Slavná poslední slova.' },
    { headline: 'Záchrana světa počká.', subtext: 'Pokud není v backlogu.' },
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
  if (contextualGreeting) {
    return { headline: contextualGreeting.headline, subtext: contextualGreeting.subtext };
  }

  const seed = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${getPlayingNowTimeBucket(date)}-${language}-${sanitizeShelfNickname(nickname)}`;
  const hash = hashString(seed);
  const pool = hash % 100 < 4 ? easterEggPools[language] : greetingPools[language][getPlayingNowTimeBucket(date)];
  const template = pool[hash % pool.length];
  return formatGreetingTemplate(template, sanitizeShelfNickname(nickname));
}

function formatGreetingTemplate(template: GreetingTemplate, name: string) {
  return {
    headline: formatTemplateText(template.headline, name),
    subtext: formatTemplateText(template.subtext, name),
  };
}

function formatTemplateText(value: string, name: string) {
  return name ? value.replace('{name}', name) : value.replace(/,?\s*\{name\}/g, '').replace(/\s{2,}/g, ' ').trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}
