# Changelog

## Unreleased

### Features & Improvements
- Unified `.lyrics` command now supports both plain and synced (LRC) lyrics.
- If synced lyrics are available, the command displays real-time lyric lines (karaoke style) by editing the message every 500ms.
- Uses advanced Riffy options and real-time lyric support in Player.js.
- No separate `.syncedlyrics` command; all logic is merged into `.lyrics` for a seamless experience.
- Example/test bots (`test/v3.js`, `test/v4.js`) updated to demonstrate this feature.

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
- Passing `channel_id` as `null` in `.setStateUpdate()` in `Connection` Class should emit `playerDestroy` event.
- `node.send` and `node.region` is not an option anymore, use `node.regions` instead
- This version rollbacks the some commits & changes mainly like `autoPlay`, Node version checks from https://github.com/riffy-team/riffy/commit/f53fbf07640e78ae4e3cc2b6009eb8d5c9104788
- This version fixes `updatePlayer` throwing Error for Constant variable leading to failure of conversion in `encodedTrack` property. Also Fixes tracks being empty in `riffy.resolve()` for v3 Node due to incorrect condition of the ternary operator
* Kindly report any found bugs and issues to us.

## 1.0.6 (2024-06-26)

## Changes
- Node Connections now be checked for inactivity on the basis of interval of sending node stats

## 1.0.5 (2024-03-24)

- Allows you to add Nodes based on regions
- If region is provided in `.createConnection()` options, that same node will be used to resolve songs. Ref- https://github.com/riffy-team/riffy/issues/7
- Fix of `.fetchRegion()` on `Riffy` for different lavalink versions

## 1.0.3 (2023-11-09)

# **Bug**
* Fixed plugin load error.

## 1.0.2 (2023-09-21)

## Changes
- `.seek()` function will not push the song forward, rather than that it will get the seeker to the passed section.

## 1.0.1 (2023-09-13)

## Changes
- Player will not lag up if disconnected manually from the VC.

## 1.0.0 (2023-09-10)

# __Release__
* In this new **1.0.0** (beta-out) version, we fixed the filters and some very unnoticeable bugs.
* Check out the [docs](https://riffy.js.org/) for more information.

## 1.0.6-beta (2023-09-09)

## Updates
- `.resolve()` can now resolve songs with Identifiers for Spotify and Youtube

## 1.0.5-beta (2023-09-05)

# __Update__
* Updated track for plugin support

## 1.0.4-beta (2023-09-04)

## Changes
- Player skipping track while doing `Player.autoplay()` has been fixed.
- New Property has been added to `Player` i.e., `.isAutoplay`
- Implementation on Autoplay has been changed a bit. Check the [documentation](https://riffy.js.org/implementations/autoplay) for new Implementation
- Functions like `.setBassboost()` has been fixed.

## 1.0.3-beta (2023-09-04)

## Changes
- `Player.play()` will throw error if prior connection is not initiated via `Riffy.createConnection()`
- Removed empty collections
- Updated typing's

## 1.0.2-beta (2023-09-04)

# Changes
- Added Compatibility Filters
- You can now remove a Filter by passing `null` as an argument in Function Method.
- Volume Property in Filters is now synced with `Player.volume`

## 1.0.1-beta (2023-09-04)

# __Bug__
* Fixed **Spotify** image not fetching.

## 1.0.0-beta (2023-08-28)

# __Release__
**Riffy** is a pro lavalink client. It is designed to be simple and easy to use, with a focus on stability and more features.
* Know more [riffy.js.org](https://riffy.js.org/)

