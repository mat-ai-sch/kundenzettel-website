export type PublicPortalSurface = 'landing' | 'demo' | 'app'

/** Production landing address. Logo links on demo and app always lead here. */
export const LANDING_URL = 'https://kundenzettel.de/'

const demoHosts = new Set(['demo.kundenzettel.de', 'www.demo.kundenzettel.de'])
const appHosts = new Set(['app.kundenzettel.de', 'www.app.kundenzettel.de'])

function normaliseHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

/**
 * Host matrix (apex and www for each surface):
 *   kundenzettel.de      / www.kundenzettel.de      -> landing
 *   demo.kundenzettel.de / www.demo.kundenzettel.de -> demo
 *   app.kundenzettel.de  / www.app.kundenzettel.de  -> app (protected operator build)
 * Every other host (localhost, previews) falls back to the landing page.
 */
export function publicPortalSurface(hostname: string): PublicPortalSurface {
  const host = normaliseHost(hostname)
  if (demoHosts.has(host)) return 'demo'
  if (appHosts.has(host)) return 'app'
  return 'landing'
}

/**
 * Target of the Kundenzettel logo on every surface.  On the landing host (and local
 * development) it stays relative; demo and app hosts leave for the production landing page.
 */
export function landingHomeUrl(hostname: string): string {
  const host = normaliseHost(hostname)
  return demoHosts.has(host) || appHosts.has(host) ? LANDING_URL : '/'
}
