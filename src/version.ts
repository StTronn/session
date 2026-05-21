// src/version.ts
import pkg from "../package.json";

/** The CLI version, sourced from package.json (bundled in at compile time). */
export const VERSION: string = pkg.version;
