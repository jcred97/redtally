export function isProfilePhoto(value: unknown): value is string {
  return typeof value === "string" && value.length <= 96_000 &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value);
}
