export const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

export const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
