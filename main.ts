import { App, Plugin, TFile, Notice, FuzzySuggestModal, getFrontMatterInfo, parseYaml, stringifyYaml } from 'obsidian';

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

		this.addCommand({
			id: 'merge-current-file-and-add-alias',
			name: 'Merge current file and add alias',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				const canRun = activeFile instanceof TFile && activeFile.extension === 'md';

				if (!canRun) {
					return false;
				}

				if (!checking && activeFile) {
					void this.mergeFileWithAlias(activeFile);
				}

				return true;
			},
		});
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

			const sourceContent = await this.app.vault.read(sourceFile);
			const targetContent = await this.app.vault.read(targetFile);
			const sourceParts = this.parseNoteContent(sourceContent);
			const targetParts = this.parseNoteContent(targetContent);

			const mergedFrontmatter = this.mergeFrontmatter(targetParts.frontmatter, sourceParts.frontmatter);
			const mergedAliases = this.mergeAliasValues(
				this.getAliasValues(mergedFrontmatter),
				[sourceFileName]
			);

			if (mergedAliases.length > 0) {
				mergedFrontmatter.aliases = mergedAliases;
			}

			if (mergedFrontmatter.alias !== undefined) {
				delete mergedFrontmatter.alias;
			}

			const mergedBody = this.mergeBodies(targetParts.body, sourceParts.body);
			const newTargetContent = this.buildNoteContent(mergedFrontmatter, mergedBody);
			await this.app.vault.modify(targetFile, newTargetContent);

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

	parseNoteContent(content: string): { frontmatter: Record<string, unknown>; body: string } {
		const info = getFrontMatterInfo(content);

		if (!info.exists) {
			return {
				frontmatter: {},
				body: content.trim(),
			};
		}

		const parsed = parseYaml(info.frontmatter) ?? {};

		return {
			frontmatter: this.isPlainObject(parsed) ? parsed : {},
			body: content.slice(info.contentStart).trim(),
		};
	}

	mergeFrontmatter(
		targetFrontmatter: Record<string, unknown>,
		sourceFrontmatter: Record<string, unknown>
	): Record<string, unknown> {
		const merged = this.mergeValues(targetFrontmatter, sourceFrontmatter);

		if (!this.isPlainObject(merged)) {
			return {};
		}

		const aliases = this.mergeAliasValues(
			this.getAliasValues(targetFrontmatter),
			this.getAliasValues(sourceFrontmatter)
		);

		if (aliases.length > 0) {
			merged.aliases = aliases;
		}

		if (merged.alias !== undefined) {
			delete merged.alias;
		}

		return merged;
	}

	mergeValues(targetValue: unknown, sourceValue: unknown): unknown {
		if (targetValue === undefined) {
			return this.cloneValue(sourceValue);
		}

		if (sourceValue === undefined) {
			return this.cloneValue(targetValue);
		}

		if (Array.isArray(targetValue) || Array.isArray(sourceValue)) {
			return this.mergeArrays(targetValue, sourceValue);
		}

		if (this.isPlainObject(targetValue) && this.isPlainObject(sourceValue)) {
			const merged: Record<string, unknown> = {};
			const keys = new Set([...Object.keys(targetValue), ...Object.keys(sourceValue)]);

			for (const key of keys) {
				merged[key] = this.mergeValues(targetValue[key], sourceValue[key]);
			}

			return merged;
		}

		return this.cloneValue(targetValue);
	}

	mergeArrays(targetValue: unknown, sourceValue: unknown): unknown[] {
		const targetArray = Array.isArray(targetValue) ? targetValue : targetValue === undefined ? [] : [targetValue];
		const sourceArray = Array.isArray(sourceValue) ? sourceValue : sourceValue === undefined ? [] : [sourceValue];
		const merged: unknown[] = [];
		const seen = new Set<string>();

		for (const item of [...targetArray, ...sourceArray]) {
			const clonedItem = this.cloneValue(item);
			const key = JSON.stringify(clonedItem);

			if (seen.has(key)) {
				continue;
			}

			seen.add(key);
			merged.push(clonedItem);
		}

		return merged;
	}

	getAliasValues(frontmatter: Record<string, unknown>): string[] {
		return this.normalizeAliasList(frontmatter.aliases ?? frontmatter.alias);
	}

	mergeAliasValues(targetAliases: string[], sourceAliases: string[]): string[] {
		const merged: string[] = [];
		const seen = new Set<string>();

		for (const alias of [...targetAliases, ...sourceAliases]) {
			const normalizedAlias = alias.trim();
			if (!normalizedAlias) {
				continue;
			}

			const key = normalizedAlias.toLocaleLowerCase();
			if (seen.has(key)) {
				continue;
			}

			seen.add(key);
			merged.push(normalizedAlias);
		}

		return merged;
	}

	normalizeAliasList(value: unknown): string[] {
		if (value === undefined || value === null) {
			return [];
		}

		const aliasItems = Array.isArray(value) ? value : [value];

		return aliasItems
			.filter((item): item is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof item))
			.map((item) => String(item).trim())
			.filter((item) => item.length > 0);
	}

	mergeBodies(targetBody: string, sourceBody: string): string {
		if (!targetBody) {
			return sourceBody;
		}

		if (!sourceBody) {
			return targetBody;
		}

		return `${targetBody}\n\n${sourceBody}`;
	}

	buildNoteContent(frontmatter: Record<string, unknown>, body: string): string {
		const hasFrontmatter = Object.keys(frontmatter).length > 0;
		const normalizedBody = body.trim();

		if (!hasFrontmatter) {
			return normalizedBody;
		}

		const yaml = stringifyYaml(frontmatter).trimEnd();
		if (!normalizedBody) {
			return `---\n${yaml}\n---`;
		}

		return `---\n${yaml}\n---\n\n${normalizedBody}`;
	}

	cloneValue(value: unknown): unknown {
		if (Array.isArray(value)) {
			return value.map((item) => this.cloneValue(item));
		}

		if (this.isPlainObject(value)) {
			const cloned: Record<string, unknown> = {};

			for (const [key, nestedValue] of Object.entries(value)) {
				cloned[key] = this.cloneValue(nestedValue);
			}

			return cloned;
		}

		return value;
	}

	isPlainObject(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
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
