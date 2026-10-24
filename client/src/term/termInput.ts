// What xterm.js reports through `onData` is not all typing.
//
// `onData` carries user keystrokes *and* the emulator's own replies to terminal
// queries (device attributes, cursor position reports, focus notifications,
// colour reports). A reply is not a keystroke: forwarding one to the agent
// types escape-sequence garbage into its TUI. Only whole-chunk replies are
// dropped — a chunk that also contains real typing is passed through untouched.

const DEVICE_REPLIES = [
  /^\x1b\[(?:\?|>)?[0-9;]*c$/, // DA1 / DA2: CSI ? 62;22 c, CSI > 1;10;0 c
  /^\x1b\[[0-9]+;[0-9]*R$/, // cursor position report: CSI 12;40 R
  /^\x1b\[(?:\?|>)?[0-9;]*u$/, // kitty keyboard flags: CSI ? 1 u
  /^\x1b\[I$/, // focus in
  /^\x1b\[O$/, // focus out
  /^\x1b\[\??[0-9;]*\$y$/, // DECRPM: CSI ? 2026 ; 2 $ y
  /^\x1bP[^\x1b]*\x1b\\$/, // DCS replies (XTVERSION, …) end with ST
  /^\x1b\][0-9]+;[^\x07\x1b]*(?:\x07|\x1b\\)$/, // OSC colour reports
];

/** True if `data` is entirely a terminal reply rather than something the user typed. */
export function isDeviceReply(data: string) {
  return DEVICE_REPLIES.some((re) => re.test(data));
}

/** The part of an `onData` chunk that came from the user ("" for a reply). */
export function typedInput(data: string) {
  return isDeviceReply(data) ? "" : data;
}
