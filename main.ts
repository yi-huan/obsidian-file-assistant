import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, type TFile } from 'obsidian';
import * as path from 'node:path';

import { downImg } from './utils/down-img';
import { generateHash } from './utils/generate-hash';
import { getExt } from './utils/get-ext';

interface Processor {
	/** 下载文件的请求 */
	down: Promise<Buffer>;
	/** 正则匹配开始 索引 */
	start: number;
	/** 正则匹配结束 索引 */
	end: number;
	// noteName: string;
	/** 地址文件名 */
	name: string,
	alt: string,
	title: string,
}

interface ProcessorDone {
	/** 正则匹配开始 索引 */
	start: number;
	/** 正则匹配结束 索引 */
	end: number;
	/** 文件数据 */
	fileData: Buffer;
	names: {
		noteName: string;
		/** 地址文件名 */
		name: string;
		alt: string;
		title: string;
		hash: string;
		ext: string;
		[prop: string]: string;
	},
}

interface FileAssistantPluginSettings {
	isRelativePath: boolean,
	assetsPath: string;
	fileName: string;
	downTimeout: number;
}

const DEFAULT_SETTINGS: FileAssistantPluginSettings = {
	isRelativePath: true,
	assetsPath: 'assets',
	fileName: '[noteName]-[hash][ext]',
	downTimeout: 5000
}

export default class FileAssistantPlugin extends Plugin {
	settings: FileAssistantPluginSettings;

	async onload() {
		await this.loadSettings();

		// // 这将在左侧功能区中创建一个图标。
		// const ribbonIconEl = this.addRibbonIcon('dice', '文件助手', (evt: MouseEvent) => {
		// 	// Called when the user clicks the icon.
		// 	new Notice('This is a notice!');
		// });
		// // 使用功能区执行其他操作
		// ribbonIconEl.addClass('my-plugin-ribbon-class');

		// 这将在应用程序底部添加一个状态栏项。不适用于移动应用。
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('');

		// 这添加了一个可以在任何地方触发的简单命令
		this.addCommand({
			id: 'download-current-file',
			name: '下载当前笔记的文件',
			callback: () => {
				// new SampleModal(this.app).open();
				this.proccessNote(this.app.workspace.getActiveFile());
			}
		});
		// // 这将添加一个编辑器命令，该命令可以对当前编辑器实例执行某些操作
		// this.addCommand({
		// 	id: 'sample-editor-command',
		// 	name: 'Sample editor command',
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection('Sample Editor Command');
		// 	}
		// });
		// // 这将添加一个复杂的命令，可以检查应用程序的当前状态是否允许执行该命令
		// this.addCommand({
		// 	id: 'open-sample-modal-complex',
		// 	name: 'Open sample modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// 要检查的条件
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			// 仅当check函数返回true时，此命令才会显示在command Palette中
		// 			return true;
		// 		}
		// 	}
		// });

		// 这将添加一个设置选项卡，以便用户可以配置插件的各个方面
		this.addSettingTab(new FileAssistantSettingTab(this.app, this));

		// // 如果插件连接任何全局DOM事件（在应用程序中不属于此插件的部分），则在禁用此插件时，使用此函数将自动删除事件侦听器。
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });

		// 注册 Interval 时，当插件被禁用时，此功能将自动清除 Interval 。
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		this.registerEvent(this.app.workspace.on('editor-paste', this.onPaste.bind(this)));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async proccessNote(file: TFile | null) {
		if (file && file.path.endsWith('.md')) {
			const content = await this.app.vault.cachedRead(file);

			const assetsPath = this.settings.isRelativePath ? path.join(path.dirname(file.path), this.settings.assetsPath) : this.settings.assetsPath;
			// console.log('assetsPath', assetsPath);
			// 确保下载的文件夹存在
			if (!await this.app.vault.adapter.stat(assetsPath)) {
				await this.app.vault.adapter.mkdir(assetsPath);
			}

			// console.log('content---', content);
			// 笔记文件名 [noteName]，下载文件名 [name]，属性文本 [alt]，标题[title]， 哈希[hash]，文件后缀 [ext]
			/** 笔记本文件名 */
			const noteName = path.basename(file.path, path.extname(file.path));
			// ![alt 属性文本](图片地址 "可选标题")
			const regexp = /!\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+)\s*(?:'|")?([^)]*?)(?:'|")?\s*\)/g;

			const matches = content.matchAll(regexp);

			const processor: Processor[] = [];

			for (const match of matches) {
				// console.log('匹配', match[0], match[1], match[2], match[3]);
				const pathname = new URL(match[2]).pathname;
				processor.push({
					down: downImg(match[2]),
					start: match.index as number,
					end: (match.index as number) + match[0].length,
					// noteName,
					/** 地址文件名 */
					name: path.basename(pathname, path.extname(pathname)),
					alt: match[1] || '',
					title: match[3] || '',
				});
				// try {
				// 	const fileData = await downImg(match[2]);
				// 	const names: Record<string, string> = {
				// 		noteName,
				// 		/** 地址文件名 */
				// 		name: path.basename(pathname, path.extname(pathname)),
				// 		alt: match[1],
				// 		title: match[3],
				// 		hash: generateHash(fileData),
				// 		ext: await getExt(fileData),
				// 	};
				// 	const fileName = this.settings.fileName.replace(/\[([^\]]+)\]/g, (match, p1) => names[p1] ? names[p1] : match);
				// 	const saveName = path.join(assetsPath, fileName);
				// 	console.log('saveName', saveName);
				// 	await this.app.vault.createBinary(saveName, fileData);
				// } catch (error) {
				// 	console.log('获取图片失败', error.message);
				// }
			}

			const needProcessLength = processor.length;
			if (needProcessLength === 0) {
				return new Notice(`"${file.path}" 没有要下载的文件`);
			}

			/** 添加一个状态栏项 */
			const statusBarItemEl = this.addStatusBarItem();
			statusBarItemEl.setText(`正在下载 ${needProcessLength} 个文件`);

			Promise.allSettled(processor.map(item => item.down))
				.then(downResults => 
					Promise.allSettled(downResults.map((result) => result.status === 'fulfilled' ? getExt(result.value) : result.reason))
						.then(extResults => extResults.map((result, index) => result.status === 'fulfilled' ? ({
							/** 正则匹配开始 索引 */
							start: processor[index].start,
							/** 正则匹配结束 索引 */
							end: processor[index].end,
							/** 文件数据 */
							fileData: (downResults[index] as any).value,
							names: {
								noteName,
								/** 地址文件名 */
								name: processor[index].name,
								alt: processor[index].alt,
								title: processor[index].title,
								hash: generateHash((downResults[index] as any).value),
								ext: result.value,
							},
						}) : null))
				)
				.then(async (_results) => {
					const results: ProcessorDone[] = _results.filter(item => !!item) as any;
					const downLength = results.length;
					statusBarItemEl.setText(downLength === needProcessLength ? `全部 ${downLength} 个文件下载成功` : `下载成功 ${downLength}，失败 ${needProcessLength - downLength}`);

					const replaceContents = [];
					let currentIndex = 0;
					let savedCount = 0;
					for (const result of results) {
						try {
							/** 文件名 */
							const fileName = this.settings.fileName.replace(/\[([^\]]+)\]/g, (match, p1) => result.names[p1] ?  result.names[p1] : match);
							/** 保存在本地的路径 */
							const saveName = path.join(assetsPath, fileName);
							/** 显示在笔记上的路径 */
							const noteFileName = (this.settings.isRelativePath ? './' : '') + path.posix.join(this.settings.assetsPath, fileName).replace(/ /g, '%20'); // 替换空格为符号
							// 本地没有文件才保存
							if (!await this.app.vault.adapter.stat(saveName)) {
								savedCount++;
								await this.app.vault.createBinary(saveName, result.fileData);
							}
							replaceContents.push(content.slice(currentIndex, result.start));
							// ![alt 属性文本](图片地址 "可选标题")
							replaceContents.push('![' + result.names.alt + '](' + noteFileName + (result.names.title ? ` "${result.names.title.replace(/"/g, '\'')}"` : '') + ')');
							currentIndex = result.end;
						} catch (error) {
							console.log('保存失败', error.message);
						}
					}
					replaceContents.push(content.slice(currentIndex, content.length));
					const replaceContent = replaceContents.join('');
					if (replaceContent !== content) {
						await this.app.vault.modify(file, replaceContent);
						new Notice(`下载 ${downLength} 个文件成功，保存了 ${savedCount} 个文件。`);
					}
					// 移除状态
					statusBarItemEl.remove();
				});
		}
	}

	private async proccessNotes () {
		const notes = this.app.vault.getMarkdownFiles();
		for (const [index, file] of notes.entries()) {
			await this.proccessNote(file);
		}
	}

	private async onPaste(event: ClipboardEvent, editor: Editor, view: MarkdownView) {
		// console.log('onPaste event', event);
		// console.log('onPaste editor', editor);
		// console.log('onPaste view', view);
	}

	// async ensurePathExists(folderPath: string) {
	// 	try {
	// 		await this.app.vault.createFolder(folderPath);
	// 	} catch (error) {
	// 		if (!error.message.contains("Folder already exists")) {
	// 		throw error;
	// 		}
	// 	}
	// }
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class FileAssistantSettingTab extends PluginSettingTab {
	plugin: FileAssistantPlugin;

	constructor(app: App, plugin: FileAssistantPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: '文件助手'});

		new Setting(containerEl)
			.setName('下载文件相对于当前笔记路径')
			.setDesc('在当前笔记的目录存储下载的文件，否则将文件存储在当前仓库下的目录')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.isRelativePath)
				.onChange(async (value) => {
					this.plugin.settings.isRelativePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('文件目录')
			.setDesc('下载的文件保存的路径')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.assetsPath)
				.onChange(async (value) => {
					this.plugin.settings.assetsPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('文件名规则')
			.setDesc('下载的文件名规则：笔记文件名 [noteName]，下载文件名 [name]，属性文本 [alt]，标题[title]， 哈希[hash]，文件后缀 [ext]')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.fileName)
				.onChange(async (value) => {
					this.plugin.settings.fileName = value;
					await this.plugin.saveSettings();
				}));

		// new Setting(containerEl)
		// 	.setName('下载超时时间')
		// 	.setDesc('下载文件多长时间失败，单位毫秒，最小值是 2000')
		// 	.addText(text => text
		// 		.setPlaceholder('2000')
		// 		.setValue(this.plugin.settings.downTimeout + '')
		// 		.onChange(async (value) => {
		// 			const result = Math.max(parseInt(value), 2000);
		// 			this.plugin.settings.downTimeout = result;
		// 			await this.plugin.saveSettings();
		// 		}));
	}
}

