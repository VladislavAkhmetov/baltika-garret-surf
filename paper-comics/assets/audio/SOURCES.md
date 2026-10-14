# Crowd reactions

The landing reactions use recordings from [Mixkit's applause collection](https://mixkit.co/free-sound-effects/applause/), obtained on 14 October 2026.

- `crowd_applause_female.wav`: **Girls audience applause**, Mixkit sound effect 510. [Original recording](https://assets.mixkit.co/active_storage/sfx/510/510.wav). The game uses seconds 0.35–3.15 for ordinary landings and ramp landings.
- `crowd_cheer_female.wav`: **Girls crowd cheer, scream, and applause**, Mixkit sound effect 515. [Original recording](https://assets.mixkit.co/active_storage/sfx/515/515.wav). The game uses seconds 1.75–4.75 for a completed flip.

Flights use three separate recordings instead of the earlier female scream:

- `crowd_flight_happy.wav`: **Happy crowd cheer**, Mixkit 975, from the [happy collection](https://mixkit.co/free-sound-effects/happy/). [Original recording](https://assets.mixkit.co/active_storage/sfx/975/975.wav), seconds 0.35–2.55.
- `crowd_flight_group.wav`: **Small group cheer and applause**, Mixkit 518, from the [applause collection](https://mixkit.co/free-sound-effects/applause/). [Original recording](https://assets.mixkit.co/active_storage/sfx/518/518.wav), seconds 0.48–2.88.
- `crowd_flight_bonus.wav`: **Crowd cheer bonus**, Mixkit 3038, from the [thank you collection](https://mixkit.co/free-sound-effects/thank-you/). [Original recording](https://assets.mixkit.co/active_storage/sfx/3038/3038.wav), seconds 0.10–2.35.

Flight reactions are played from a shuffled bag. Each bag contains every recording once; its first recording differs from the preceding bag's last recording. The queue and last played recording persist across pause and replay. Muted or blocked playback does not consume a variation.

The earlier `crowd_awe.wav` recording is retained for the disappointed crowd reaction when a shark hits the rider and reduces board speed. It is no longer used during a jump.

The Mixkit recordings are supplied under the [Mixkit Sound Effects Free License](https://mixkit.co/license/modal/sfxFree/), which permits incorporation into commercial and non-commercial video games. They remain third-party recordings and are not offered as a standalone sound library.

Processing preserves the original stereo recording and 44.1 kHz sample rate, removes the DC offset, trims the reaction to its active section, and applies short fades. Landing clips are peak-normalized to 0.86. Flight clips are matched to a maximum 0.20 RMS with a 0.86 peak ceiling, and receive a gentle −4 dB high shelf above 2.8 kHz to soften harsh treble. No pitch shift is used. `node paper-comics/scripts/prepare_crowd_audio.cjs` reproduces the game clips and a combined audition WAV from the downloaded originals in `paper-comics/review/comics/crowd-sourcing/`.
