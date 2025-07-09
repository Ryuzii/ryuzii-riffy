# Changelog

## Unreleased

### Features & Improvements
- Unified `.lyrics` command now supports both plain and synced (LRC) lyrics.
- If synced lyrics are available, the command displays real-time lyric lines (karaoke style) by editing the message every 500ms.
- Uses advanced Riffy options and real-time lyric support in Player.js.
- No separate `.syncedlyrics` command; all logic is merged into `.lyrics` for a seamless experience.
- Example/test bots (`test/v3.js`, `test/v4.js`) updated to demonstrate this feature.
- Major improvements and refactors in `build/structures` (Player.js, Riffy.js, Node.js, etc.) for advanced options, seamless auto-resume, diagnostics, plugin system, queue/track management, and more.
- Player.js: Real-time lyrics support, unified lyrics command, advanced queue/history, robust auto-resume, and diagnostics.
- Riffy.js: True auto-resume (rejoin VC and resume playback after restart), improved node management, delayed player restore until node connect, and detailed debug logging.
- Node.js, Rest.js, Track.js, Queue.js, Plugins.js, Filters.js, Connection.js: All updated for new options schema, diagnostics, plugin support, and performance.
- autoPlay.js: Improved SoundCloud, Spotify, and Apple Music autoplay logic, robust error handling, and updated endpoints.
- **Apple Music autoplay now uses advanced genre/region-aware logic:**
    - Tries all genres of the original track in the original country.
    - Tries the main chart in the original country.
    - Tries the pop genre in the original country.
    - If KPOP/JPOP, tries the Korean/Japanese main chart.
    - Falls back to the US main chart as a last resort.
    - Logs each fallback step for transparency.
- All test bots and documentation updated to demonstrate and explain these new features.

## v1.0.7 (2025-06-10)

### What's Changed
* CI: add continuous (PREVIEW) releases by @UnschooledGamer in https://github.com/riffy-team/riffy/pull/16
### Features & Improvements
* fix: added totp to spotify autoplay endpoint (#20) by @olliedean in https://github.com/riffy-team/riffy/pull/21
* chore: Update Spotify get token endpoint as it has changed, leading to autoplay errors.
- [Add: fetchInfo & Node.info & types, includeHeaders option for `Rest.makeRequest`](https://github.com/riffy-team/riffy/commit/3734cb0c3fc9dbe7933b3aa6149d77ba16acff6e)
- [feat: lyrics API, add: fetchInfo when Node Connected `bypassChecks.nodeFetchInfo` option in RiffyOptions to suppress the Error thrown](https://github.com/riffy-team/riffy/commit/84a70abaae6fae91f13fb4ac68e96b1ccd0264f6)

- TypeScript Declarations:
  * Added richer types for events, lyrics, and Lavalink node info.
  * Introduced RiffyEventType enum and RiffyEvents type map for better event handling.
  * Improved option and response types, including support for nullable fields and lyric plugins.
  
- Player 
  * [feat: Allow Multiple Previous Tracks (Default: Only One Track)](https://github.com/riffy-team/riffy/commit/74f9ca40130c20bdb6052323d5584df2b0c4a363)
  * Added clearData() method to clear all custom data on a player.
  * More informative debug events and tracking for playback state and transitions. 
  
 - **Debug & Logging:** Extended debug events throughout the Riffy class and player lifecycle for better traceability.

### Dependency Updates
- Updated jsdom and discord.js(dev dependency) to newer versions.

### New Contributors
* @olliedean made their first contribution in https://github.com/riffy-team/riffy/pull/21

**Full Changelog**: https://github.com/riffy-team/riffy/compare/v1.0.7-rc.2...v1.0.7

## v1.0.7-rc.2 (2024-09-20)

* Update error message and correct autoplay function imports
- Improve error message for missing 'endpoint' in VOICE_SERVER_UPDATE
- Fix incorrect imports for autoplay functions:
  - Update import from 'soundcloud, spotify' to 'spAutoPlay, scAutoPlay'
- Adjust function calls to use correctly imported names
**Full Changelog**: https://github.com/riffy-team/riffy/compare/1.0.7-rc.1...v1.0.7-rc.2

## 1.0.7-rc.1 (2024-07-25)

## What's Changed
* feat: use primitive types instead of wrappers by @feenko in https://github.com/riffy-team/riffy/pull/12
* feat: readme.md refresh by @feenko in https://github.com/riffy-team/riffy/pull/13
* And 
- Some Types fixtures
- added Default Volume and loop option to `createConnection`
## New Contributors
* @feenko made their first contribution in https://github.com/riffy-team/riffy/pull/12
**Full Changelog**: https://github.com/riffy-team/riffy/compare/1.0.7-beta.1...1.0.7-rc.1u

## 1.0.7-beta.1 (2024-07-01)

## Beta Version Changes
- Improved Typings
- Passing `channel_id` as `null` in `.setStateUpdate()` in `Connection` Class should emit `playerDestroy`