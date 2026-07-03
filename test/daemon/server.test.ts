import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import {handleRequest, startServer} from '../../src/daemon/server.js'

function request(sock: string, method: string, urlPath: string): Promise<{body: unknown; status: number}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        createConnection: () => net.createConnection(sock),
        method,
        path: urlPath,
      },
      (res) => {
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => {
          buf += c
        })
        res.on('end', () => {
          try {
            resolve({body: buf ? JSON.parse(buf) : null, status: res.statusCode ?? 0})
          } catch (error) {
            reject(error)
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('daemon (stub, hordr-zn3f)', () => {
  describe('handleRequest (unit)', () => {
    it('GET /health → {ok:true}', () => {
      const res = handleRequest('GET', '/health')
      expect(res.status).to.equal(200)
      expect(res.body).to.deep.equal({ok: true})
    })

    it('unknown route → 404', () => {
      const res = handleRequest('POST', '/complete')
      expect(res.status).to.equal(404)
      expect((res.body as {error: string}).error).to.match(/unknown route/)
    })

    it('GET unknown → 404', () => {
      const res = handleRequest('GET', '/nope')
      expect(res.status).to.equal(404)
    })
  })

  describe('startServer (integration over unix socket)', () => {
    let dir: string
    let sock: string
    let server: {close: () => Promise<void>}

    beforeEach(async () => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'hordr-dmn-st-'))
      sock = path.join(dir, 'hordr.sock')
      server = await startServer({path: sock})
    })

    afterEach(async () => {
      await server.close()
      rmSync(dir, {force: true, recursive: true})
    })

    it('serves /health over the socket', async () => {
      const res = await request(sock, 'GET', '/health')
      expect(res.status).to.equal(200)
      expect(res.body).to.deep.equal({ok: true})
    })

    it('returns 404 JSON for unknown routes', async () => {
      const res = await request(sock, 'POST', '/complete')
      expect(res.status).to.equal(404)
      expect((res.body as {error: string}).error).to.match(/unknown route/)
    })
  })
})
