import { execFile } from 'node:child_process';
import * as path from 'node:path';

export class Git {
    constructor(private readonly cwd: string, private readonly executable = 'git') {}

    run(args: string[], absentCode?: number, trim = true): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            execFile(this.executable, ['-C', this.cwd, ...args], {
                windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
            }, (error, stdout) => {
                if (!error) resolve(trim ? stdout.trim() : stdout);
                else if (absentCode !== undefined && error.code === absentCode) resolve(undefined);
                else reject(new Error(`Git ${args[0]} failed. Check that Git is installed, the selected file belongs to a repository, and its Git metadata is readable.`));
            });
        });
    }

    async required(args: string[]): Promise<string> {
        const value = await this.run(args);
        if (!value) throw new Error(`Git ${args[0]} returned no value.`);
        return value;
    }

    config(key: string): Promise<string | undefined> {
        return this.run(['config', '--get', key], 1);
    }
}

export interface Repository {
    git: Git;
    root: string;
    filePath: string;
    branch: string;
    remotes: string[];
    upstreamRemote?: string;
}

export async function resolveRepository(file: string, executable?: string): Promise<Repository> {
    const git = new Git(path.dirname(file), executable);
    const root = await git.required(['rev-parse', '--show-toplevel']);
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Select a file inside a Git repository.');
    }
    const branch = await git.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], 1) ?? '';
    const remotes = (await git.run(['remote']))?.split(/\r?\n/).filter(Boolean) ?? [];
    return {
        git, root, filePath: relative.split(path.sep).join('/'), branch, remotes,
        upstreamRemote: branch ? await git.config(`branch.${branch}.remote`) : undefined,
    };
}

export function preferredRemote(remotes: string[], upstream?: string, configured?: string): string | undefined {
    if (configured) {
        if (!remotes.includes(configured)) throw new Error('Configured remote does not exist in the selected repository.');
        return configured;
    }
    if (upstream && remotes.includes(upstream)) return upstream;
    if (remotes.includes('origin')) return 'origin';
    return remotes.length === 1 ? remotes[0] : undefined;
}

