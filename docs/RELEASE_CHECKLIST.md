# Release checklist

## Engineering gates

- [ ] Automated macOS and Windows CI is green.
- [ ] 8-hour idle/active soak and 200 show/hide cycles meet CPU, GPU, memory, and crash targets.
- [ ] 100/100 native hit-mask clicks and pass-through clicks succeed on both operating systems.
- [ ] Mixed DPI, negative monitor coordinates, portrait monitors, hot-plug, sleep/wake, lock/unlock, and full-screen suppression pass on real hardware.
- [ ] Capture granted/denied/revoked, HDR/protected content, 200 ms timeout, and WebGL context loss all select the correct path.
- [ ] Emergency hide removes every overlay in under one second; Quit exits in under two seconds.
- [ ] Network/disk inspection confirms no pixels, pointer positions, input data, app names, or filenames leave RAM.

## Content and accessibility gates

- [ ] Final separated Free Motion Rig layers and original SFX binaries pass `npm run check:assets` and manifest validation.
- [ ] Every downloadable voice pack passes checksum, attribution, offline synthesis, and native listening review for its locale.
- [ ] Reduce Motion replaces run/jump/shake; no strobe or jump scare remains.
- [ ] CJK font fallback, wrapping, pseudo-localization, and all four native reviews pass.
- [ ] Legal/art review approves the #10 goat and #7 camel designs.
- [ ] Beta metrics meet the fun/non-annoyance and emergency-hide targets.

## Distribution gates

- [ ] Configure a non-empty updater public key and separate beta/stable HTTPS endpoints.
- [ ] Sign and notarize universal or separate Intel/Apple Silicon macOS builds with Developer ID.
- [ ] Authenticode-sign the Windows x64 NSIS installer.
- [ ] Verify a signed N−1 → N update on physical machines and never apply it during an episode.
- [ ] Publish the reviewed privacy policy and permission copy.
