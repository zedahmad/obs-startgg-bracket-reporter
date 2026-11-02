export type SettingsChanges = { [key: string]: unknown };

function isRecord(value: unknown): value is SettingsChanges {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getSettingsChanges(
  previous: object,
  next: object,
): SettingsChanges {
  const before = previous as SettingsChanges;
  return Object.fromEntries(
    Object.entries(next).flatMap(([key, value]) => {
      if (isRecord(value) && isRecord(before[key])) {
        const changes = getSettingsChanges(before[key], value);
        return Object.keys(changes).length ? [[key, changes]] : [];
      }
      return value === before[key] ? [] : [[key, value]];
    }),
  );
}

export function mergeSettingsChanges<T extends object>(
  current: T,
  changes: SettingsChanges,
): T {
  const values = current as SettingsChanges;
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(changes).map(([key, value]) => [
        key,
        isRecord(value) && isRecord(values[key])
          ? mergeSettingsChanges(values[key], value)
          : value,
      ]),
    ),
  };
}
