import { describe, expect, it } from 'vitest';
import { highlightSegments } from './highlight';

describe('highlightSegments', () => {
  it('marks every match case-insensitively', () => {
    expect(highlightSegments('Cloud cloud', 'cloud')).toEqual([
      { text: 'Cloud', hit: true },
      { text: ' ', hit: false },
      { text: 'cloud', hit: true },
    ]);
    expect(highlightSegments('abc', ' ')).toEqual([{ text: 'abc', hit: false }]);
  });
});
