import { readFileSync, writeFileSync, mkdirSync } from "fs";

/** usage-api.ts와 identity.ts가 각자 구현하던 JSON 파일 스토어를 공용화한 것 */
export function readJsonStore<T>(file: string): Record<string, T> {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function writeJsonStore<T>(
  dir: string,
  file: string,
  store: Record<string, T>,
  mode?: number
): void {
  try {
    mkdirSync(dir, { recursive: true });
    if (mode !== undefined) {
      writeFileSync(file, JSON.stringify(store), { encoding: "utf8", mode });
    } else {
      writeFileSync(file, JSON.stringify(store), "utf8");
    }
  } catch {
    // Ignore write errors
  }
}
