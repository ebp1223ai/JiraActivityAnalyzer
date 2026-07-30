# Jira Activity Analyzer v0.2.50 Package Size Audit

- Generated from the final packaged source commit `180fe906de551773f980a32e01b4f65ba0ba2b78`.
- Binary artifacts remain ignored and are not committed.
- `app.asar.unpacked` was not generated.

## Summary

| Artifact | Bytes | MiB |
|---|---:|---:|
| Installer | 106261315 | 101.339 |
| Portable | 106031236 | 101.119 |
| win-unpacked | 398395005 | 379.939 |
| resources | 24201516 | 23.08 |
| app.asar | 24093996 | 22.978 |
| app.asar.unpacked | 0 | 0 |
| unpacked EXE | 235706368 | 224.787 |

## Top 50 Files

| # | Relative path | Bytes | MiB |
|---:|---|---:|---:|
| 1 | `Jira Activity Analyzer.exe` | 235706368 | 224.787 |
| 2 | `dxcompiler.dll` | 25609728 | 24.423 |
| 3 | `resources\app.asar` | 24093996 | 22.978 |
| 4 | `LICENSES.chromium.html` | 20313277 | 19.372 |
| 5 | `icudtl.dat` | 10876560 | 10.373 |
| 6 | `libGLESv2.dll` | 8021504 | 7.65 |
| 7 | `resources.pak` | 7147269 | 6.816 |
| 8 | `vk_swiftshader.dll` | 5494784 | 5.24 |
| 9 | `d3dcompiler_47.dll` | 4741488 | 4.522 |
| 10 | `ffmpeg.dll` | 3061248 | 2.919 |
| 11 | `locales\ml.pak` | 1705247 | 1.626 |
| 12 | `locales\ta.pak` | 1696416 | 1.618 |
| 13 | `locales\kn.pak` | 1661406 | 1.584 |
| 14 | `locales\te.pak` | 1571646 | 1.499 |
| 15 | `locales\hi.pak` | 1529365 | 1.459 |
| 16 | `dxil.dll` | 1509760 | 1.44 |
| 17 | `locales\bn.pak` | 1460793 | 1.393 |
| 18 | `locales\gu.pak` | 1443467 | 1.377 |
| 19 | `locales\mr.pak` | 1414904 | 1.349 |
| 20 | `locales\th.pak` | 1320614 | 1.259 |
| 21 | `locales\el.pak` | 1250786 | 1.193 |
| 22 | `locales\uk.pak` | 1172427 | 1.118 |
| 23 | `locales\ru.pak` | 1163087 | 1.109 |
| 24 | `locales\bg.pak` | 1137844 | 1.085 |
| 25 | `locales\ar.pak` | 1095898 | 1.045 |
| 26 | `locales\sr.pak` | 1075610 | 1.026 |
| 27 | `locales\fa.pak` | 1026720 | 0.979 |
| 28 | `locales\ur.pak` | 1009975 | 0.963 |
| 29 | `locales\am.pak` | 994404 | 0.948 |
| 30 | `vulkan-1.dll` | 924160 | 0.881 |
| 31 | `locales\he.pak` | 898516 | 0.857 |
| 32 | `locales\ja.pak` | 815268 | 0.778 |
| 33 | `locales\vi.pak` | 799477 | 0.762 |
| 34 | `locales\lt.pak` | 751706 | 0.717 |
| 35 | `locales\lv.pak` | 748765 | 0.714 |
| 36 | `v8_context_snapshot.bin` | 740048 | 0.706 |
| 37 | `locales\hu.pak` | 738244 | 0.704 |
| 38 | `locales\fr.pak` | 738084 | 0.704 |
| 39 | `locales\sk.pak` | 729969 | 0.696 |
| 40 | `locales\cs.pak` | 718396 | 0.685 |
| 41 | `locales\pl.pak` | 717434 | 0.684 |
| 42 | `locales\fil.pak` | 715474 | 0.682 |
| 43 | `locales\ro.pak` | 702275 | 0.67 |
| 44 | `locales\sl.pak` | 698884 | 0.667 |
| 45 | `locales\ko.pak` | 693731 | 0.662 |
| 46 | `locales\de.pak` | 693010 | 0.661 |
| 47 | `locales\ca.pak` | 691926 | 0.66 |
| 48 | `locales\hr.pak` | 690892 | 0.659 |
| 49 | `locales\es-419.pak` | 682813 | 0.651 |
| 50 | `locales\es.pak` | 679423 | 0.648 |

## Top 20 Directories

| # | Relative path | Bytes | MiB |
|---:|---|---:|---:|
| 1 | `locales` | 48895643 | 46.631 |
| 2 | `resources` | 24201516 | 23.08 |

## Capacity Classification

- The unpacked Electron runtime executable and Chromium runtime are the primary capacity source.
- Locale packs are the largest aggregated directory after the executable.
- Application code and production dependencies are contained in the 22.978 MiB `app.asar`.
- Dependency documentation/test/example trees and Markdown were excluded by electron-builder; the final unexpected documentation count is zero.
