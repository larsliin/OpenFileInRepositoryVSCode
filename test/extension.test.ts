import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { compareFile, repositoryUrl } from '../src/extension';

export async function run(): Promise<void> {
    const root = process.env.REPOSITORY_TEST_WORKSPACE;
    assert.ok(root);
    const extension = vscode.extensions.getExtension('larsliin.open-file-in-repository');
    assert.ok(extension);
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const command of ['openFile', 'openRepository', 'compare', 'compareLocal']) {
        assert.ok(commands.includes(`openFileInRepository.${command}`));
    }
    const manifest = extension.packageJSON;
    for (const menu of ['explorer/context', 'editor/title/context']) {
        const items = manifest.contributes.menus[menu];
        assert.equal(items.length, 4);
        assert.equal(new Set(items.map((item: { group: string }) => item.group.split('@')[0])).size, 1);
        assert.ok(items.every((item: { when: string }) => item.when.includes('resourceScheme == file')));
    }
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, 'active.ts')));
    const selected = vscode.Uri.file(path.join(root, 'selected file.ts'));
    assert.equal(await repositoryUrl('file', selected),
        'https://github.com/example/repository/blob/feature%2Flinks/selected%20file.ts');
    assert.equal(await repositoryUrl('repository', selected), 'https://github.com/example/repository');
    assert.equal(await repositoryUrl('compare', selected, async options => {
        assert.equal(options?.value, '');
        assert.ok(options?.prompt?.includes('feature/links'));
        assert.ok(await options?.validateInput?.('  '));
        assert.ok(await options?.validateInput?.('feature/links'));
        assert.equal(await options?.validateInput?.('develop'), undefined);
        return ' develop ';
    }), 'https://github.com/example/repository/compare/develop...feature%2Flinks');
    const settings = vscode.workspace.getConfiguration('openFileInRepository', selected);
    await settings.update('baseBranch', 'release', vscode.ConfigurationTarget.Workspace);
    try {
        assert.equal(await repositoryUrl('compare', selected, async options => {
            assert.equal(options?.value, 'release');
            return 'main';
        }), 'https://github.com/example/repository/compare/main...feature%2Flinks');
        assert.equal(await repositoryUrl('compare', selected, async () => undefined), undefined);
        await assert.rejects(repositoryUrl('compare', selected, async () => ' '), /Enter a base branch/);
        await assert.rejects(repositoryUrl('compare', selected, async () => 'feature/links'), /same/);
    } finally {
        await settings.update('baseBranch', undefined, vscode.ConfigurationTarget.Workspace);
    }
    await assert.rejects(repositoryUrl('compare', vscode.Uri.file(path.join(root, 'untracked.ts'))), /not tracked/);
    await assert.rejects(repositoryUrl('file', vscode.Uri.file(path.join(root, 'untracked.ts'))), /not tracked/);
    await assert.rejects(repositoryUrl('file', vscode.Uri.parse('untitled:new')), /saved file/);
    const document = await vscode.workspace.openTextDocument(selected);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(selected, new vscode.Position(0, 0), '// unsaved working edit\n');
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.ok(document.isDirty);
    await compareFile(selected, async () => 'develop');
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab?.input instanceof vscode.TabInputTextDiff);
    assert.equal(tab.input.modified.toString(), selected.toString());
    const original = await vscode.workspace.openTextDocument(tab.input.original);
    assert.equal(original.getText(), 'export const selected = true;\n');
    assert.ok(document.getText().startsWith('// unsaved working edit\n'));
    const beforeCancel = vscode.window.tabGroups.activeTabGroup.activeTab;
    await compareFile(selected, async () => undefined);
    assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab, beforeCancel);
    await assert.rejects(compareFile(selected, async () => 'missing-branch'), /Branch not found/);
    await assert.rejects(compareFile(vscode.Uri.file(path.join(root, 'untracked.ts')), async () => 'develop'), /does not exist/);
    const nested = vscode.Uri.file(path.join(root, 'src', 'nested.ts'));
    await compareFile(nested, async () => 'develop');
    const nestedTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(nestedTab?.input instanceof vscode.TabInputTextDiff);
    assert.equal(nestedTab.input.modified.toString(), nested.toString());
    assert.equal((await vscode.workspace.openTextDocument(nestedTab.input.original)).getText(), '  nested base\n\n');
    console.log('Extension Host: registration, menu contributions, selected-file URLs and failure cases passed.');
}
