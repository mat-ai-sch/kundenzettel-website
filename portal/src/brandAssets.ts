// Keep the wordmark inside the JavaScript bundle.  The protected operator
// application is an SPA behind Cloudflare Access, and a stale PWA cache must
// never be able to replace this image request with the document fallback.
import wordmarkUrl from '../public/brand/kundenzettel-logo.png?inline'

/**
 * Critical operator UI artwork is bundled with the application JavaScript.
 * This avoids a separate request to the Worker asset fallback.
 */
export const brandWordmarkUrl = wordmarkUrl
