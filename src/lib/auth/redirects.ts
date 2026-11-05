/** Where to go after signing in, taken from `?next=`: only a path of this site. */
export function safeNextPath(value: string | string[] | undefined | null) {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}

export function withNext(path: string, next: string | undefined) {
  return next ? `${path}?${new URLSearchParams({ next })}` : path;
}
