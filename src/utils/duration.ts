// JWT refresh lifetimes use integer seconds, minutes, hours or days.
export function parseDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);
  const milliseconds = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Number(match[1]) * milliseconds[match[2] as keyof typeof milliseconds];
}
