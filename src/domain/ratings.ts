export function elo(red: number, black: number, score: 0 | 0.5 | 1) {
  const expected = 1 / (1 + 10 ** ((black - red) / 400));
  const raw = 32 * (score - expected);
  const delta = Math.sign(raw) * Math.round(Math.abs(raw));
  return { red: red + delta, black: black - delta, delta };
}
export const ratingBand = (waitMilliseconds: number) => Math.min(400, 100 + 50 * Math.floor(Math.max(0, waitMilliseconds) / 10000));
