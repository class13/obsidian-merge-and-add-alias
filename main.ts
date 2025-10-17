import { App, Plugin, TFile, Notice, FuzzySuggestModal } from 'obsidian';

export default class MergeAndAddAliasPlugin extends Plugin {
	async onload() {
		// Add command to file menu
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('Merge into and add alias')
							.setIcon('files')
							.onClick(async () => {
								await this.mergeFileWithAlias(file);
							});
					});
				}
			})
		);
	}

	async mergeFileWithAlias(sourceFile: TFile) {
		// Open modal to select target file
		const targetFile = await this.selectTargetFile(sourceFile);
		if (!targetFile) {
			return;
		}

		try {
			const sourceFileName = sourceFile.basename;
			const targetFileName = targetFile.basename;

			// Get content of both files
			const sourceContent = await this.app.vault.read(sourceFile);
			const targetContent = await this.app.vault.read(targetFile);

			// Append source content to target
			const newTargetContent = targetContent + '\n\n' + sourceContent;
			await this.app.vault.modify(targetFile, newTargetContent);

			// Add source filename as alias to target file's frontmatter
			await this.addAliasToFrontmatter(targetFile, sourceFileName);

			// Replace all links to source file with aliased links
			await this.replaceLinksWithAliases(sourceFileName, targetFileName);

			// Delete source file
			await this.app.vault.delete(sourceFile);

			new Notice(`Merged "${sourceFileName}" into "${targetFileName}" and updated all references`);
		} catch (error) {
			new Notice(`Error during merge: ${error.message}`);
			console.error('Merge error:', error);
		}
	}

	async addAliasToFrontmatter(file: TFile, alias: string) {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			// Get existing aliases
			let aliases = frontmatter['aliases'] || frontmatter['alias'];

			// Convert to array if needed
			if (!aliases) {
				aliases = [];
			} else if (typeof aliases === 'string') {
				aliases = [aliases];
			} else if (!Array.isArray(aliases)) {
				aliases = [aliases];
			}

			// Add new alias if not already present
			if (!aliases.includes(alias)) {
				aliases.push(alias);
			}

			// Set the aliases property
			frontmatter['aliases'] = aliases;

			// Remove 'alias' property if it exists (consolidate to 'aliases')
			if (frontmatter['alias']) {
				delete frontmatter['alias'];
			}
		});
	}

	async replaceLinksWithAliases(oldFileName: string, newFileName: string) {
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			let content = await this.app.vault.read(file);
			let modified = false;

			// Pattern 1: [[OldFile]] -> [[NewFile|OldFile]]
			const simpleWikiLinkPattern = new RegExp(`\\[\\[${this.escapeRegex(oldFileName)}\\]\\]`, 'g');
			if (simpleWikiLinkPattern.test(content)) {
				content = content.replace(simpleWikiLinkPattern, `[[${newFileName}|${oldFileName}]]`);
				modified = true;
			}

			// Pattern 2: [[OldFile|ExistingAlias]] -> [[NewFile|ExistingAlias]]
			const aliasedWikiLinkPattern = new RegExp(`\\[\\[${this.escapeRegex(oldFileName)}\\|([^\\]]+)\\]\\]`, 'g');
			if (aliasedWikiLinkPattern.test(content)) {
				content = content.replace(aliasedWikiLinkPattern, `[[${newFileName}|$1]]`);
				modified = true;
			}

			// Pattern 3: [[OldFile#heading]] -> [[NewFile#heading|OldFile]]
			const headingLinkPattern = new RegExp(`\\[\\[${this.escapeRegex(oldFileName)}(#[^\\]|]+)\\]\\]`, 'g');
			if (headingLinkPattern.test(content)) {
				content = content.replace(headingLinkPattern, `[[${newFileName}$1|${oldFileName}]]`);
				modified = true;
			}

			// Pattern 4: [[OldFile#heading|ExistingAlias]] -> [[NewFile#heading|ExistingAlias]]
			const headingAliasLinkPattern = new RegExp(`\\[\\[${this.escapeRegex(oldFileName)}(#[^\\]|]+)\\|([^\\]]+)\\]\\]`, 'g');
			if (headingAliasLinkPattern.test(content)) {
				content = content.replace(headingAliasLinkPattern, `[[${newFileName}$1|$2]]`);
				modified = true;
			}

			if (modified) {
				await this.app.vault.modify(file, content);
			}
		}
	}

	escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	async selectTargetFile(sourceFile: TFile): Promise<TFile | null> {
		return new Promise((resolve) => {
			const modal = new FileSelectModal(this.app, sourceFile, (file) => {
				resolve(file);
			});
			modal.open();
		});
	}
}

class FileSelectModal extends FuzzySuggestModal<TFile> {
	private sourceFile: TFile;
	private onSelect: (file: TFile) => void;

	constructor(app: App, sourceFile: TFile, onSelect: (file: TFile) => void) {
		super(app);
		this.sourceFile = sourceFile;
		this.onSelect = onSelect;
		this.setPlaceholder('Select target file to merge into...');
	}

	getItems(): TFile[] {
		// Get all markdown files except the source file
		return this.app.vault.getMarkdownFiles()
			.filter(file => file.path !== this.sourceFile.path);
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(file);
	}
}
