# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that allows users to merge two markdown files while preserving all references to the merged file through automatic alias creation and link replacement throughout the vault.

## Build Commands

- `npm run dev` - Development mode with watch (auto-rebuilds on changes, includes sourcemaps)
- `npm run build` - Production build (TypeScript check + esbuild bundle)

All output files (`main.js` and `manifest.json`) are placed in the `build/` directory, ready for deployment to `.obsidian/plugins/merge-and-add-alias/`.

## Architecture

### Single-File Plugin Structure
The plugin is implemented entirely in `main.ts` with two main classes:
- `MergeAndAddAliasPlugin` - Main plugin logic
- `FileSelectModal` - Fuzzy search modal for target file selection

### Core Merge Operation Flow
When a user right-clicks a file and selects "Merge into and add alias", the plugin executes 4 sequential operations:

1. **Content Merge**: Appends source file content to target file
2. **Frontmatter Update**: Adds source filename as alias in target file's frontmatter using `processFrontMatter()`
3. **Vault-Wide Link Replacement**: Scans entire vault and updates all references:
   - `[[SourceFile]]` → `[[TargetFile|SourceFile]]`
   - `[[SourceFile|CustomAlias]]` → `[[TargetFile|CustomAlias]]`
   - `[[SourceFile#heading]]` → `[[TargetFile#heading|SourceFile]]`
   - `[[SourceFile#heading|CustomAlias]]` → `[[TargetFile#heading|CustomAlias]]`
4. **Cleanup**: Deletes source file after successful merge

### Key Implementation Details

**Link Replacement Pattern Matching**
The `replaceLinksWithAliases()` method uses 4 distinct regex patterns to handle all wikilink variations. Each pattern:
- Uses `escapeRegex()` to sanitize filenames for regex matching
- Tests content before replacement (optimization)
- Only modifies files that contain matching links

**Frontmatter Handling**
Uses Obsidian's `app.fileManager.processFrontMatter()` API for atomic frontmatter updates:
- Normalizes both `alias` and `aliases` fields to array format
- Consolidates to `aliases` property only
- Prevents duplicate aliases

**File Menu Integration**
Registers event listener on `file-menu` workspace event, adding context menu item only for markdown files.

## Build Configuration

The build process uses esbuild (`esbuild.config.mjs`) with:
- Entry point: `main.ts`
- Output: `build/main.js` (CommonJS format, ES2018 target)
- Post-build: Automatically copies `manifest.json` to `build/`
- External dependencies: Obsidian API and all CodeMirror modules marked as external (provided by Obsidian runtime)

## Testing Plugin Locally

To test changes in an Obsidian vault:
1. Run `npm run dev` to start watch mode
2. Create symlink or copy `build/` contents to vault's `.obsidian/plugins/merge-and-add-alias/`
3. Enable plugin in Obsidian settings (or reload with Ctrl/Cmd+R if already enabled)

**Note**: iCloud-synced vaults may have issues with manual plugin installation due to macOS's handling of hidden folders. Consider testing in a local vault first.
