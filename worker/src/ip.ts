// Posting limits (and, later, bans) are keyed by the poster's network, not the exact address: the full IPv4 address,
// but only the first 64 bits of an IPv6 one, since a home connection gets a whole /64 and can pick any address in it.
// Returns null for anything that isn't an IP address.
export function ipNetwork(ip: string): string | null {
  const address = ip.trim().replace(/%.*$/, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
    return address.split('.').every(part => Number(part) <= 255) ? address : null
  }
  const groups = ipv6Groups(address)
  if (!groups) return null
  // An IPv4 address written as IPv6 (::ffff:1.2.3.4) is really IPv4
  if (groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff) {
    return [groups[6]! >> 8, groups[6]! & 255, groups[7]! >> 8, groups[7]! & 255].join('.')
  }
  return `${groups
    .slice(0, 4)
    .map(group => group.toString(16))
    .join(':')}::/64`
}

function ipv6Groups(address: string): number[] | null {
  if (!address.includes(':') || !/^[0-9a-fA-F:.]+$/.test(address)) return null
  // A trailing embedded IPv4 address (::ffff:1.2.3.4) is two groups
  let text = address
  const ipv4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)
  if (ipv4) {
    const bytes = ipv4.slice(1).map(Number)
    if (bytes.some(byte => byte > 255)) return null
    text = `${text.slice(0, ipv4.index)}${((bytes[0]! << 8) | bytes[1]!).toString(16)}:${((bytes[2]! << 8) | bytes[3]!).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part ? part.split(':') : [])
  const head = parse(halves[0]!)
  const tail = halves.length === 2 ? parse(halves[1]!) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.some(group => !/^[0-9a-fA-F]{1,4}$/.test(group))) return null
  return groups.map(group => parseInt(group, 16))
}

// The network, keyed with a secret only the relay has (HMAC-SHA-256), so a stored key can't be turned back into an
// address by trying them all, as a plain hash could
export async function ipKey(network: string, secret: string): Promise<string> {
  return hmac(secret, `ip:${network}`)
}

export async function hmac(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return [...signature].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
