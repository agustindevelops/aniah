import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (folder that contains `apps/` and `packages/`), from this package location. */
export const REPO_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export function resolveImageStorageDir(): string {
  const fromEnv = process.env.IMAGE_STORAGE_DIR;
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(REPO_ROOT, fromEnv);
  }
  return resolve(REPO_ROOT, "data", "images");
}

export function resolveDefaultSqlitePath(): string {
  return process.env.SQLITE_DB_PATH ?? resolve(REPO_ROOT, "data", "local-sync.db");
}

/** True if `candidate` resolves to a path inside `root` (not the root itself). */
export function isPathUnderRoot(root: string, candidate: string): boolean {
  const r = resolve(root);
  const c = resolve(candidate);
  const rel = relative(r, c);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
