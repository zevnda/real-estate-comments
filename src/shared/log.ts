// Every console line is prefixed so users (and bug reports) can filter the page console down to this extension.
const PREFIX = '[Real Estate Comments]'

export const log = {
  debug: (...args: unknown[]) => console.debug(PREFIX, ...args),
  info: (...args: unknown[]) => console.info(PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(PREFIX, ...args),
  error: (...args: unknown[]) => console.error(PREFIX, ...args),
}
