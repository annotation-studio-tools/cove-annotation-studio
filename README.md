# Annotation Studio for COVE

A focused timeline editor for [COVE](https://github.com/yourcove/cove). Annotate **what happens and when** using native COVE tags and segments, with faster playback and fewer clicks.

## Install

Requires **COVE 1.7.0 or later**. Tested with COVE 1.7.0 on Windows; later versions and other platforms have not been verified.

1. Download the extension ZIP from [Releases](https://github.com/jwach26/cove-annotation-studio/releases).
2. In COVE, open **Settings → Extensions → Discover → More extension actions → Install from ZIP**.
3. Choose the ZIP and review COVE's unverified-extension notice. This is a third-party extension.
4. Reload COVE, open a video, and choose **Annotate**.

No core COVE changes or separate server are needed. Existing tag segments appear immediately. The extension uses COVE's authenticated APIs and storage.

## Features

- Visible 0.5×, 1×, 2×, 3× and 5× playback buttons; ±1s and ±5s seeking.
- A compact, zoomable timeline with separate rows for overlapping tags.
- An **Unannotated** row showing time without any saved tag. Click a gap to prefill a draft.
- Boundary fields displayed as **mm:ss.ss**, with ±0.1s/±1s nudging, playhead capture and draggable edges.
- **New interval** beside the editor title; **Duplicate** copies timing into a new draft for another tag.
- Search or create a tag in one selector. Type a new name and press Enter, or save the interval to create it.
- Saved intervals shown chronologically or grouped by tag, with individual and bulk collapse controls.
- Interval preview/looping, unsaved-draft recovery in the current browser session, and undo for the latest deletion.
- Portable JSON import/export with scene fingerprints, custom tag definitions, exact timestamps and overlap.

On a wide screen the interval list sits left of the video and the editor sits right, with the timeline underneath. In narrower views, **Intervals** and **Editor** open side panels.

## Quick annotation workflow

Play the video, press **I** at the start and **O** at the end, choose a tag, then **Save interval**. To add an act with exactly the same timing, select the saved interval, choose **Duplicate**, select another tag, and save the new draft. Duplication does not modify the original interval.

| Shortcut | Action |
| --- | --- |
| Space | Play/pause |
| Left / Right | Seek ±1 second |
| Shift + Left / Right | Seek ±5 seconds |
| 1 / 2 / 3 / 5 | Playback speed |
| N | New interval |
| I / O | Capture start/end from the playhead |
| Ctrl/Cmd + S | Save draft |
| Escape | Cancel draft, asking before discarding changes |

## JSON sharing

**Export JSON** downloads saved tag segments as a .annotations.json file. Unsaved drafts are excluded. Files contain annotations, tag definitions and scene identifiers—not media, local paths, database IDs or opaque segment payloads.

Open the corresponding local video and choose **Import JSON** to preview another file. Imports add missing intervals, skip exact duplicates and keep local edits to previously imported annotations. A mismatched or unverifiable file requires alignment acknowledgement. Imports never automatically delete or replace existing intervals.

Only Annotation Studio version-1 JSON is supported. See [JSON-FORMAT.md](JSON-FORMAT.md) for the contract, identity rules and interruption/retry behavior. No community server is included.

## Playback and data limits

The editor streams the original file through COVE's native endpoint. Verified with H.264/AAC MP4 files. It does not include COVE's HLS/transcoding, VR, captions or alternate-file selection controls; use COVE's standard player when those are needed.

Existing raw tag intervals are edited directly. Fractional precision and native source/payload fields are retained unless deliberately changed. Display profiles do not rewrite exported data.

Save/delete perform a preflight comparison to catch another editor's changes. This is not an atomic multi-user lock. Imports use sequential API writes; if interrupted, saved entries remain and a retry skips them. Keep regular COVE database backups during substantial annotation work.

## Build from source

Requires **.NET 10 SDK**, **Python 3.10+** and **Node.js 22+** for checks. The build restores pinned **Cove.Sdk 1.7.0** from NuGet; a COVE checkout is not required. Host assemblies are not redistributed in the ZIP.

~~~sh
node --test src/model.test.mjs src/exchange.test.mjs
node --check src/studio.mjs
python build.py
node --check artifacts/studio.mjs
~~~

If dotnet is not on PATH, pass --dotnet /path/to/dotnet. Use --output /path/to/output to change the artifact directory. Windows subprocesses are launched without console windows by the build script.

Output: artifacts/annotation-studio-0.2.0.zip and its SHA-256 checksum. The ZIP contains only the extension assembly, manifest, frontend bundle, stylesheet and license.

## Development

Frontend source uses COVE's public runtime modules. The Python build combines the dependency-free model/exchange modules into one ESM bundle. Node tests cover timing precision, overlap, gap coverage, portable round trips, duplicates, conflicts and scene checks.

The first public release was developed with AI assistance and manually exercised in COVE, including save/reload, duplicate timing, deletion/undo and JSON export/import/re-import. Contributions and bug reports are welcome; please use synthetic examples rather than private scene maps, credentials or media.

## License and attribution

[AGPL-3.0-or-later](LICENSE). This is an independent extension, not an official COVE release. See [NOTICE](NOTICE) for acknowledgements.
