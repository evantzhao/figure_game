import { expect, it } from 'vitest';
import { isSameOrigin } from '@/server/origin';

it.each([
  ['http://127.0.0.1:3100', '127.0.0.1:3100', 'http:', true],
  ['https://figure.example', 'figure.example', 'https:', true],
  ['https://figure.example', 'figure.example:443', 'https:', true],
  ['https://evil.example', 'figure.example', 'https:', false],
  ['http://figure.example', 'figure.example', 'https:', false],
  ['https://figure.example:444', 'figure.example', 'https:', false],
  ['https://figure.example/path', 'figure.example', 'https:', false],
  ['null', 'figure.example', 'https:', false],
  [null, 'figure.example', 'https:', false],
  ['https://figure.example', null, 'https:', false],
] as const)('validates Origin %s against authority %s and protocol %s', (origin, host, protocol, allowed) => {
  expect(isSameOrigin(origin, host, protocol)).toBe(allowed);
});
