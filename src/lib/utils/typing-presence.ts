/** Return true only when a typing signal may be sent to WhatsApp native APIs.
 * Android traffic is currently suspended while investigating SIGSEGV.
 */
export function shouldSendTypingPresence(
  android: boolean,
  blocked: boolean,
  nowMs: number,
  lastSentMs: number
): boolean {
  return !android && !blocked && nowMs - lastSentMs >= 4000;
}
