import * as vscode from 'vscode';
import { Git, preferredRemote, resolveRepository } from './repository';
import { Action, buildUrl, parseRemote, Provider, Templates } from './urls';

async function comparisonBranch(
    uri: vscode.Uri,
    branch: string,
    title: string,
    prompt: typeof vscode.window.showInputBox,
): Promise<string | undefined> {
    const input = await prompt({
        title,
        prompt: `Enter the branch to compare against ${branch}.`,
        value: vscode.workspace.getConfiguration('openFileInRepository', uri).get<string>('baseBranch')?.trim() || '',
        validateInput: value => !value.trim() ? 'Enter a branch.'
            : value.trim() === branch ? 'Choose a branch other than the current branch.' : undefined,
    });
    if (input === undefined) return;
    const base = input.trim();
    if (!base) throw new Error('Enter a base branch to open a comparison.');
    if (base === branch) throw new Error('The base and current branch are the same. Enter a different branch.');
    return base;
}

export async function repositoryUrl(
    action: Action,
    uri: vscode.Uri,
    promptBase: typeof vscode.window.showInputBox = vscode.window.showInputBox,
): Promise<string | undefined> {
    if (uri.scheme !== 'file') throw new Error('Select a saved file in the Explorer or an editor tab.');
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type & vscode.FileType.Directory) throw new Error('Select a file, not a folder.');
    const settings = vscode.workspace.getConfiguration('openFileInRepository', uri);
    const repository = await resolveRepository(uri.fsPath, vscode.workspace.getConfiguration('git').get<string>('path') || undefined);
    if (!repository.remotes.length) throw new Error('This repository has no remotes. Add a Git remote before opening repository links.');
    const remoteName = preferredRemote(repository.remotes, repository.upstreamRemote, settings.get<string>('remote'))
        ?? await vscode.window.showQuickPick(repository.remotes, { title: 'Choose repository remote' });
    if (!remoteName) return;
    const raw = await repository.git.required(['remote', 'get-url', '--', remoteName]);
    const remote = parseRemote(raw, settings.get<Provider>('provider', 'auto'));
    let base = '';
    if (action !== 'repository' && !repository.branch) throw new Error('HEAD is detached. Check out a branch to open a branch-based file or comparison.');
    if (action === 'file' || action === 'compare') {
        const tracked = await repository.git.run(['ls-files', '--error-unmatch', '--', uri.fsPath], 1);
        if (tracked === undefined) throw new Error('This file is not tracked by Git. Commit and push it before opening it in the repository.');
    }
    if (action === 'compare') {
        const input = await comparisonBranch(uri, repository.branch, 'Compare Branch Against Branch in Repository', promptBase);
        if (input === undefined) return;
        base = input;
    }
    return buildUrl(remote, action, repository.branch, repository.filePath, base, settings.get<Templates>('urlTemplates', {}));
}

export async function compareFile(
    uri: vscode.Uri,
    prompt: typeof vscode.window.showInputBox = vscode.window.showInputBox,
): Promise<void> {
    if (uri.scheme !== 'file') throw new Error('Select a saved file in the Explorer or an editor tab.');
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type & vscode.FileType.Directory) throw new Error('Select a file, not a folder.');
    const repository = await resolveRepository(uri.fsPath, vscode.workspace.getConfiguration('git').get<string>('path') || undefined);
    if (!repository.branch) throw new Error('HEAD is detached. Check out a branch before comparing files.');
    const base = await comparisonBranch(uri, repository.branch, 'Compare Branch Against Branch Locally', prompt);
    if (base === undefined) return;
    let ref = `refs/heads/${base}`;
    if (await repository.git.run(['show-ref', '--verify', '--quiet', ref], 1) === undefined) {
        ref = `refs/remotes/${base}`;
        if (await repository.git.run(['show-ref', '--verify', '--quiet', ref], 1) === undefined) {
            throw new Error('Branch not found locally. Enter a local branch name or a remote-tracking branch such as origin/develop.');
        }
    }
    const commit = await repository.git.required(['show-ref', '--verify', '--hash', ref]);
    const entry = await repository.git.run(['--literal-pathspecs', 'ls-tree', '--full-tree', commit, '--', repository.filePath]);
    const blob = entry?.match(/^\d+ blob ([a-f0-9]+)\t/)?.[1];
    if (!blob) throw new Error('The selected file does not exist as a regular file on that branch.');
    const snapshot = vscode.Uri.from({
        scheme: 'repository-compare',
        path: `/${repository.filePath}`,
        query: new URLSearchParams({ root: repository.root, blob }).toString(),
    });
    await vscode.commands.executeCommand('vscode.diff', snapshot, uri,
        `${repository.filePath}: ${base} vs ${repository.branch} (Working File)`);
}

async function open(action: Action, selection?: vscode.Uri): Promise<void> {
    try {
        const uri = selection ?? vscode.window.activeTextEditor?.document.uri;
        if (!uri) throw new Error('Select a saved file in the Explorer or an editor tab.');
        const url = await repositoryUrl(action, uri);
        if (!url) return;
        if (!await vscode.env.openExternal(vscode.Uri.parse(url))) throw new Error('Could not open the repository URL. Check your default browser.');
    } catch (error) {
        await vscode.window.showErrorMessage(`Open File in Repository: ${error instanceof Error ? error.message : 'Unexpected command failure.'}`);
    }
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('repository-compare', {
        async provideTextDocumentContent(uri) {
            const query = new URLSearchParams(uri.query);
            const root = query.get('root');
            const blob = query.get('blob');
            if (!root || !blob || !/^[a-f0-9]{40,64}$/.test(blob)) throw new Error('Invalid repository comparison snapshot.');
            const content = await new Git(root, vscode.workspace.getConfiguration('git').get<string>('path') || undefined)
                .run(['show', blob], undefined, false);
            if (content === undefined) throw new Error('Could not read the comparison file.');
            if (content.includes('\0')) throw new Error('Binary files are not supported by the local text comparison.');
            return content;
        },
    }));
    context.subscriptions.push(vscode.commands.registerCommand('openFileInRepository.compareLocal', async (selection?: vscode.Uri) => {
        try {
            const uri = selection ?? vscode.window.activeTextEditor?.document.uri;
            if (!uri) throw new Error('Select a saved file in the Explorer or an editor tab.');
            await compareFile(uri);
        } catch (error) {
            await vscode.window.showErrorMessage(`Open File in Repository: ${error instanceof Error ? error.message : 'Unexpected comparison failure.'}`);
        }
    }));
    for (const [command, action] of [
        ['openFile', 'file'], ['openRepository', 'repository'], ['compare', 'compare'],
    ] as const) {
        context.subscriptions.push(vscode.commands.registerCommand(`openFileInRepository.${command}`, (uri?: vscode.Uri) => open(action, uri)));
    }
}
