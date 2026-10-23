/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#173b34',
    tint: '#1b6655',
    background: '#f6f2e8',
    foreground: '#173b34',
    card: '#fffdf7',
    cardForeground: '#173b34',
    primary: '#1b6655',
    primaryForeground: '#fffdf7',
    counterProgressTrack: '#548779',
    goalExceeded: '#74283f',
    goalExceededForeground: '#fff8fa',
    goalExceededTrack: '#a7566e',
    secondary: '#e8eee7',
    secondaryForeground: '#23483e',
    muted: '#ebe7dc',
    mutedForeground: '#6e7970',
    accent: '#e7a45c',
    accentForeground: '#302f28',
    destructive: '#b84f43',
    destructiveForeground: '#ffffff',
    border: '#ded9cc',
    input: '#ded9cc',
  },
  dark: {
    text: '#f1ede2',
    tint: '#91c4a7',
    background: '#14251f',
    foreground: '#f1ede2',
    card: '#1c312a',
    cardForeground: '#f1ede2',
    primary: '#91c4a7',
    primaryForeground: '#14251f',
    counterProgressTrack: '#54806b',
    goalExceeded: '#6e263b',
    goalExceededForeground: '#fff8fa',
    goalExceededTrack: '#9f5268',
    secondary: '#263a32',
    secondaryForeground: '#dce9dc',
    muted: '#26352e',
    mutedForeground: '#a8b5a9',
    accent: '#efb875',
    accentForeground: '#302f28',
    destructive: '#d57b6e',
    destructiveForeground: '#ffffff',
    border: '#35453d',
    input: '#35453d',
  },
  radius: 8,
};

export default colors;
