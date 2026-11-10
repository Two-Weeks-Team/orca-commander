// Numerals and counter punctuation only; localized/CJK text keeps the system face.
// The face is embedded at build time by the expo-font config plugin (app.json), so it is present on the first
// frame on both platforms. Android finds it as assets/fonts/<name>.ttf and iOS by its PostScript name; both are
// this name. It is already the 700 face: render it at the normal weight, because Android has no bold variant of
// a single-file family and falls back to a system face when one is requested.
export const DECK_NUMERAL_FONT = 'BarlowCondensed-Bold';
