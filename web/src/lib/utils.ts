export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function isJsonFile(file: File): boolean {
  return /\.json$/i.test(file.name) || file.type === "application/json";
}
