import { describe, it, expect } from 'vitest';
import { cleanDiscordText } from '../src/renderer/discord-text';

describe('cleanDiscordText', () => {
  it('removes mentions, custom emoji and spoilers', () => {
    expect(cleanDiscordText('У модератора <@1449841338898972734> день рождения <:moon:123456> ||тайна||! Ура')).toBe('У модератора день рождения ! Ура');
  });
  it('drops bold, underline, strike and heading marks but keeps the words', () => {
    expect(cleanDiscordText('## Энд\n**Открытие** __3 октября__ ~~в 19:00~~ в 20:00')).toBe('Энд\nОткрытие 3 октября в 19:00 в 20:00');
  });
  it('turns markdown links into their text and collapses blank lines', () => {
    expect(cleanDiscordText('Читайте [правила](https://moonlandmc.ru/rules)\n\n\n\nИ всё')).toBe('Читайте правила\n\nИ всё');
  });
  it('returns an empty string for an image-only post', () => {
    expect(cleanDiscordText('')).toBe('');
  });
});
