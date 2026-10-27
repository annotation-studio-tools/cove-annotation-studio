# Annotation Studio JSON, version 1

Use **Export JSON** to download the current video's saved tag segments as a .annotations.json file. Unsaved drafts are excluded. **Import JSON** previews a file before any writes. This version accepts this format only, not the older experimental act-map JSON.

The file contains metadata and annotations, never video data. Local database ids, absolute paths, authentication values and opaque segment payloads are excluded.

## Structure

- format: "cove.annotation-studio"
- version: 1 (integer)
- exported_at: ISO timestamp, informational
- scene: title, duration_seconds, remote_ids [{endpoint,id}], fingerprints [{type,value}]
- tags: [{name,description?}] for the exported tags
- segments: [{id,tag,start_seconds,end_seconds}]

Time values are numbers in source-video seconds with full available precision. end_seconds may be null for a point. Overlapping intervals are valid and retained independently. Tag names are portable; importing resolves them to local COVE tag IDs and creates missing tags, including their supplied descriptions.

Each segment has an opaque portable annotation ID. Imported IDs survive later exports and edits. Existing annotations without a portable ID receive a deterministic SHA-256 ID from scene identity, tag, exact timing and duplicate ordinal during export. These are snapshot identities; there is no revision server or automatic conflict merge in this release.

## Import behavior

1. Parse and validate the complete file (maximum 5 MB / 50,000 segments). Reject unsupported versions, malformed intervals and repeated IDs.
2. Compare scene fingerprints/remote identifiers and duration. Perceptual hashes alone cannot verify a file. A missing exact fingerprint match or a duration/identifier discrepancy requires the reviewer to acknowledge matching timeline alignment. No offsets or rescaling are applied.
3. Show a preview: intervals to add, exact duplicates, existing imported IDs with local changes, and new tags. Times beyond the current video's duration block import.
4. Re-read current native data on confirmation. Add missing intervals only. Never delete or replace existing annotations. Exact tag/time duplicates are skipped; conflicts with existing imported IDs preserve the local records.
5. Store imported segments through COVE's native API with sourceKey local.annotation-studio and a unique sourceRunId. The annotation_studio payload retains the portable annotation ID and import run ID.

Imports use sequential native API writes, not one database transaction. If interrupted, already-saved intervals remain; retrying the file detects those entries and continues without duplication. A simultaneously edited COVE instance may race the preflight check; atomic multi-user merging is future work.

## Sharing

Share the JSON file directly with another person who owns the corresponding video. They open their local scene, choose Import JSON, check alignment if requested, and confirm the preview. No website, account or external upload is involved. Scene fingerprints and metadata IDs help match the correct copy, but edits with different intros or cuts require separate alignment work.
