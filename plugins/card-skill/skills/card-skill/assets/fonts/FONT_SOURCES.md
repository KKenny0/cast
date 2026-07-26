# Offline font sources

All files below are checked into this repository so renderer and capture never fetch a font at runtime. They were retrieved on 2026-07-26 from the official upstream paths and are licensed under SIL Open Font License 1.1; the matching license texts are kept beside the files.

| Local file | Official upstream | Revision | SHA-256 | License |
|---|---|---|---|---|
| `DMSans-Variable.ttf` | `google/fonts` `ofl/dmsans/DMSans[opsz,wght].ttf` | `7ff85c87f93ea6cca5f41c69f2e4edcb90240f26` | `8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d` | `DM-Sans-OFL.txt` |
| `DMSerifDisplay-Regular.ttf` | `google/fonts` `ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf` | `7ff85c87f93ea6cca5f41c69f2e4edcb90240f26` | `8cc3643535edf039aa5d95440a8542735e9197e4f4b8d9303e980fefbf5ab616` | `DM-Serif-Display-OFL.txt` |
| `JetBrainsMono-Variable.ttf` | `JetBrains/JetBrainsMono` `fonts/variable/JetBrainsMono[wght].ttf` | `19371302b95d218af43299bce79ddbddd0bc364d` | `3cfafa86e28b87184d592fef82846e8c10cb48653c62efcda34f082da225ec34` | `JetBrains-Mono-OFL.txt` |

The upstream URLs are intentionally recorded in the repository history instead of the render contract. A future update must pin an exact upstream commit or release before replacing a binary and its hash.
