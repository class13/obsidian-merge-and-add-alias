# Merge and Add Alias

An Obsidian plugin that merges two markdown files while automatically updating all references throughout your vault.

## Features

- **Smart File Merging** - Merge any markdown file into another with a right-click
- **Automatic Alias Creation** - Adds the source filename as an alias in the target file's frontmatter
- **Vault-Wide Link Updates** - Updates all references across your entire vault
- **Link Preservation** - Maintains custom aliases and heading references

## How It Works

When you merge File A into File B:

1. File A's content is appended to File B
2. "File A" is added as an alias in File B's frontmatter
3. All links are updated throughout your vault:
   - `[[File A]]` → `[[File B|File A]]`
   - `[[File A|Custom]]` → `[[File B|Custom]]`
   - `[[File A#heading]]` → `[[File B#heading|File A]]`
4. File A is deleted

## Usage

1. Right-click on any markdown file
2. Select **"Merge into and add alias"**
3. Choose the target file using fuzzy search

## Installation

### Manual Installation

1. Copy the plugin files to `<vault>/.obsidian/plugins/merge-and-add-alias/`
2. Reload Obsidian
3. Enable the plugin in Settings → Community Plugins

### Building from Source

```bash
npm install
npm run build
```

Files will be in the `build/` directory.

## Development

```bash
npm run dev  # Watch mode with auto-rebuild
npm run build  # Production build
```

## Requirements

- Obsidian v0.15.0 or higher

## License

MIT
