import assert from 'node:assert/strict'
import { LANDING_URL, landingHomeUrl, publicPortalSurface } from './publicHost'

// Host matrix: apex and www for landing, demo and app.
assert.equal(publicPortalSurface('kundenzettel.de'), 'landing')
assert.equal(publicPortalSurface('www.kundenzettel.de'), 'landing')
assert.equal(publicPortalSurface('demo.kundenzettel.de'), 'demo')
assert.equal(publicPortalSurface('www.demo.kundenzettel.de'), 'demo')
assert.equal(publicPortalSurface('www.demo.kundenzettel.de.'), 'demo')
assert.equal(publicPortalSurface('app.kundenzettel.de'), 'app')
assert.equal(publicPortalSurface('www.app.kundenzettel.de'), 'app')
assert.equal(publicPortalSurface('WWW.APP.Kundenzettel.de.'), 'app')
assert.equal(publicPortalSurface('localhost'), 'landing')
assert.equal(publicPortalSurface('127.0.0.1'), 'landing')

// Logo target: demo and app always leave for the production landing page.
assert.equal(LANDING_URL, 'https://kundenzettel.de/')
assert.equal(landingHomeUrl('demo.kundenzettel.de'), LANDING_URL)
assert.equal(landingHomeUrl('www.demo.kundenzettel.de'), LANDING_URL)
assert.equal(landingHomeUrl('app.kundenzettel.de'), LANDING_URL)
assert.equal(landingHomeUrl('www.app.kundenzettel.de'), LANDING_URL)
assert.equal(landingHomeUrl('kundenzettel.de'), '/')
assert.equal(landingHomeUrl('www.kundenzettel.de'), '/')
assert.equal(landingHomeUrl('localhost'), '/')

console.log('public host tests passed')
