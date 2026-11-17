# CUE Enhanced Attendance

Unofficial Firefox add-on for the CHRIST University **CUE** student portal. It shows your **effective attendance** (co-curricular and medical leave, following the portal's own rules) and **how many classes you need to attend or can skip** to reach your target, both overall and per subject.

> Not affiliated with CHRIST (Deemed to be University). Everything runs in your browser. Nothing is sent anywhere.

## Install (Firefox 140+)

1. Open the **[latest release](https://github.com/GPrabhanjana/cue-enhanced-attendance/releases/latest)** and download the `.xpi` file.
2. Install it in one of two ways:
   - drag the `.xpi` onto any Firefox window, or
   - go to `about:addons`, click ⚙ (top right), choose **Install Add-on From File…**, and pick the `.xpi`.
3. Click **Add** when Firefox asks.

New versions install automatically. Firefox checks about once a day. To check now, go to `about:addons` and click ⚙ → **Check for Updates**.

## What it adds

**Attendance page**
- **Overall card:**
  - *Effective attendance x%* appears when you have co-curricular hours.
  - *With medical x%* appears when you have medical leave.
  - If you have neither, nothing is added.
- **Target card:** set a target % (default 85) and see *You need N more classes*, *You can skip N and maintain X%* or *You cannot skip classes*. It also has a **Count medical** checkbox and a **?** that explains the calculation.

**View Details (per subject)**
- Four cards for that subject: attendance %, Present, Absent (split into co-curricular, medical and other), and the same Target card.

**Toolbar icon**
- Shows the version, a short description, and a *Report a bug* link.

## How it calculates

These follow the portal's *Attendance Information* box:

- **Attendance** is classes attended ÷ classes held, the same figure the portal shows.
- **Co-curricular** hours are added back, as the university does at semester end.
- **Medical leave** counts only while attendance (with co-curricular) is between **74.50% and 84.49%**. The range is read from the portal itself. Below that range, medical leave counts as absent, so the target count shows the classes you actually need.
- The counts assume you attend (or skip) every class from now on.

## Privacy

- **Permissions:** only `storage`, and it runs only on `cue.christuniversity.in`.
- **Saved locally:** your target %, the *Count medical* setting, and the last subject you opened.
- **Network:** it makes no network requests. Firefox itself checks this repo's `updates.json` for new versions.

## Report a bug

Use **Report a bug** in the add-on's toolbar popup. It pre-fills the version and browser. You can also [open an issue](https://github.com/GPrabhanjana/cue-enhanced-attendance/issues/new) directly.

---

## Development

```
extension/        the add-on (load this folder for testing)
updates.json      update manifest Firefox polls (maintained by the release workflow)
.github/workflows/release.yml
```

To test locally, go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select `extension/manifest.json`.

### Releasing

1. Change code in `extension/`.
2. Bump `"version"` in `extension/manifest.json` (e.g. `1.8.0` → `1.8.1`). Mozilla rejects a version number it has already signed.
3. Push to `main`.

The **Release** workflow then:
1. lints the add-on
2. has Mozilla sign it
3. publishes `vX.Y.Z` with the signed `.xpi`
4. adds the version to `updates.json`

Installed copies pick up the new version within about a day. Pushes that don't change the version are skipped.

One-time setup: add the repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, from addons.mozilla.org → Developer Hub → *Manage API Keys*.

### Moving to a public AMO listing later

1. Release a final self-hosted version **without** `update_url` in `extension/manifest.json`.
2. Submit a **higher** version as *listed* on addons.mozilla.org.

Firefox then moves existing installs over to the listed version automatically.

## License

MIT © [Prabhanjana](https://gprabhanjana.netlify.app/)
