/**
 * Design system.
 *
 * Tokens are CSS custom properties in ./tokens.css and component styles in
 * ./components.css, both imported once in the root layout. Components live in
 * ./components.
 *
 * Two rules hold for everything added here: no component hardcodes a raw colour,
 * size or duration (it reads a token), and nothing is styled inline twice.
 * The standard this system is built to is written down in ./README.md.
 */

export { cn } from "./cn";
export * from "./components";
