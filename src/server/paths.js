// Shared filesystem paths for the server modules.
// Kept in its own module so route files can resolve client assets without
// importing app.js (which would create a circular import).
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Directory containing the static client (index.html, app.js, styles.css). */
export const publicPath = path.join(__dirname, '../client/public');

/** Path to the SPA shell served for client-side routes. */
export const indexHtmlPath = path.join(publicPath, 'index.html');

/** Root of the repository. */
export const repoRoot = path.resolve(__dirname, '../..');
