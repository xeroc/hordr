import os from 'node:os'
import path from 'node:path'

/**
 * Default daemon socket path: $HOME/.hordr/hordr.sock.
 * Override with HORDR_SOCKET. The daemon creates the parent dir on start.
 */
export function socketPath(): string {
  return process.env.HORDR_SOCKET ?? path.join(os.homedir(), '.hordr', 'hordr.sock')
}
