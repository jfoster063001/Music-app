What Changed

Secret-based backend access replaced account requirements for host controls and uploads.
Added reusable secret guard in secrets.js
Host-only routes now require host secret:
tournaments.js
matchups.js
songs.js
Upload route now requires upload secret in header x-upload-secret:
songs.js:27
Public song listing now hides artist data by design.
Public endpoint returns only id + title:
songService.js:1
songs.js:12
Added host/admin endpoint with full metadata for cleanup:
songs.js:16
Host page converted to one-person secret unlock flow and duplicate cleanup.
Host UI changed from username/password to host secret unlock:
host.html:12
Added upload secret input and admin song list with delete buttons:
host.html:46
host.html:58
Host client rewritten for secret headers and admin list actions:
host.js
Tournament setup API calls now send host secret and use admin song list:
tournamentSetup.js
Public landing page now shows uploaded songs (title only).
Added song board UI:
index.html:20
Added landing script for title-only list refresh:
landing.js
Added styling:
global.css:120
Live voting visibility improved without adding extra API endpoints.
Voter screen now shows live submitted count during voting and final count after close:
voting.html:36
voting.js:33
Display screen now shows vote count through voting and results:
display.js:38
Artist reveal behavior aligned to your request.
Live public matchup payload now hides artists.
Artists are still available in final standings after tournament completion.
tournamentService.js:508
Safety improvement for song deletion.
Prevents deleting songs that are used in setup/active tournaments:
songService.js:75
Docs and env sample updated.
README.md
.dev.vars.example
Validation

Ran diagnostics on all edited files: no errors reported.
How To Use Now

Set secrets in .dev.vars:
HOST_SECRET
UPLOAD_SECRET
Open host page and unlock with host secret:
/host
Upload songs using upload secret field in host page.

Audience and display pages:

/voting shows live vote submitted count
/display shows live/final vote submitted count
/ shows title-only song board
Important Note

I did not remove legacy auth routes/files; they remain in the codebase but are no longer required for host/upload/tournament flow.
Next Step I Recommend

Add a tiny uploader-only page that uses upload secret so non-host helpers can upload without opening host controls.

I’m adding both quality-of-life features now: a copy button per upload code and a CSV export button for all codes so you can hand them out quickly at check-in. I’ll patch the host UI, wire actions in the host script, and then validate for errors.

I’m updating the host upload-code panel to support per-code copy and one-click CSV export, using the already-fetched code list so it adds zero extra API calls during normal use.

The UI actions are wired; I’m doing a quick diagnostics pass and then I’ll summarize exactly how to use copy/export during event setup.

Added both requested code-sharing features for player uploads:

Copy button per upload code
Each row in the upload-code list now has a Copy action.
Implemented in host.js and rendered in host.html.
CSV export for all upload codes
Added Export Codes CSV button in host UI.
Exports current code list with columns:
code
status (used/unused)
created_at
used_at
used_song_id
Implemented in host.js and button added in host.html.
Styling update

Upload code rows now support two action buttons (Copy + Delete) in host.css.
Validation

Checked diagnostics for all edited files: no errors found.
Usage

Open host page and unlock with host secret.
Create upload codes.
Click Copy on any code to paste to a player.
Click Export Codes CSV to download a full handout list for check-in.