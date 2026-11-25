import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Git, preferredRemote, resolveRepository } from '../src/repository';
import { buildUrl, parseRemote } from '../src/urls';

test('normalizes HTTPS, SCP and SSH remotes without leaking credentials', () => {
    for (const raw of [
        'https://user:secret@github.com/team/repo.git',
        'git@github.com:team/repo.git',
        'ssh://git@github.com/team/repo.git',
        'ssh://git@ssh.github.com:443/team/repo.git',
    ]) {
        assert.deepEqual(parseRemote(raw), { repository: 'https://github.com/team/repo', provider: 'github' });
    }
    assert.deepEqual(parseRemote('git@ssh.dev.azure.com:v3/org/project/repo'), {
        repository: 'https://dev.azure.com/org/project/_git/repo', provider: 'azure',
    });
    assert.equal(parseRemote('https://gitlab.com/group/subgroup/repo.git/').repository, 'https://gitlab.com/group/subgroup/repo');
    assert.equal(parseRemote('ssh://git@code.example.test:2222/group/repo.git', 'gitlab').provider, 'gitlab');
    assert.equal(parseRemote('https://code.example.test:8443/group/repo.git').repository, 'https://code.example.test:8443/group/repo');
});

test('rejects invalid and non-web remotes without including secrets in errors', () => {
    for (const raw of ['C:\\repo', '/local/repo', 'file:///team/repo', 'ftp://host/team/repo', 'https://host/repo', 'https://host/team/repo?secret=token', 'https://host/team/re%ZZ']) {
        assert.throws(() => parseRemote(raw), error => error instanceof Error && !error.message.includes(raw));
    }
});

test('builds provider-specific file and base-to-head comparisons with encoded references', () => {
    const cases = [
        ['https://github.com/team/repo', '/blob/feature%2Fone/src/file%20%23%3F.ts', '/compare/release%2Fone...feature%2Fone'],
        ['https://gitlab.com/team/repo', '/-/blob/feature%2Fone/src/file%20%23%3F.ts', '/-/compare/release%2Fone...feature%2Fone'],
        ['https://bitbucket.org/team/repo', '/src/feature%2Fone/src/file%20%23%3F.ts', '/branches/compare/feature%2Fone%0Drelease%2Fone'],
        ['https://dev.azure.com/org/project/_git/repo', '?path=%2Fsrc%2Ffile%20%23%3F.ts&version=GBfeature%2Fone&_a=contents', '?_a=branchCompare&baseVersion=GBrelease%2Fone&targetVersion=GBfeature%2Fone'],
    ];
    for (const [repository, file, compare] of cases) {
        const remote = parseRemote(repository!);
        assert.equal(buildUrl(remote, 'file', 'feature/one', 'src/file #?.ts', ''), repository! + file!);
        assert.equal(buildUrl(remote, 'compare', 'feature/one', '', 'release/one'), repository! + compare!);
    }
});

test('GitHub opens a plain branch comparison while custom comparison templates remain authoritative', () => {
    const remote = parseRemote('https://github.com/team/repo');
    assert.equal(buildUrl(remote, 'compare', 'feature/one', 'src/file #?.ts', 'develop'),
        'https://github.com/team/repo/compare/develop...feature%2Fone');
    assert.equal(buildUrl(remote, 'compare', 'feature/one', 'src/file.ts', 'develop', {
        compare: '{repository}/compare/{base}...{branch}?file={path}',
    }), 'https://github.com/team/repo/compare/develop...feature%2Fone?file=src/file.ts');
});

test('unknown hosts use explicit provider or HTTPS templates, never GitHub routes by default', () => {
    const remote = parseRemote('git@code.example.test:group/repo.git');
    assert.equal(buildUrl(remote, 'repository', '', '', ''), remote.repository);
    assert.throws(() => buildUrl(remote, 'file', 'topic', 'file', ''), /Unknown repository provider/);
    assert.equal(buildUrl(remote, 'file', 'topic/a', 'dir/æ %.ts', '', {
        file: '{repository}/src/branch/{branch}/{path}',
    }), 'https://code.example.test/group/repo/src/branch/topic%2Fa/dir/%C3%A6%20%25.ts');
    assert.throws(() => buildUrl(remote, 'file', 'topic', 'file', '', { file: 'https://host/{typo}' }), /Unknown URL template token/);
    assert.throws(() => buildUrl(remote, 'file', 'topic', 'file', '', { file: 'https://host/{constructor}' }), /Unknown URL template token/);
    for (const template of ['', 'javascript:alert(1)', 'https://user:pass@host/repo']) {
        assert.throws(() => buildUrl(remote, 'repository', '', '', '', { repository: template }), /HTTPS/);
    }
});

test('remote preference follows override, upstream, origin, sole remote, then prompt', () => {
    assert.equal(preferredRemote(['origin', 'upstream'], 'upstream'), 'upstream');
    assert.equal(preferredRemote(['origin', 'upstream'], 'upstream', 'origin'), 'origin');
    assert.equal(preferredRemote(['origin', 'other'], 'missing'), 'origin');
    assert.equal(preferredRemote(['single'], '.'), 'single');
    assert.equal(preferredRemote(['first', 'second']), undefined);
    assert.throws(() => preferredRemote(['origin'], '', 'missing'), /does not exist/);
});

test('resolves selected-file repositories, nested repositories and linked worktrees read-only', async () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'repository-unit-'));
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const init = (directory: string, branch: string) => {
        mkdirSync(directory, { recursive: true });
        git(directory, 'init', '-b', branch);
        writeFileSync(path.join(directory, 'file #.ts'), 'content');
        git(directory, 'add', '.');
        git(directory, '-c', 'user.name=Extension Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    };
    try {
        const outer = path.join(temporary, 'outer');
        const nested = path.join(outer, 'nested');
        init(outer, 'outer-branch');
        init(nested, 'feature/inner');
        git(nested, 'remote', 'add', 'origin', 'git@gitlab.com:group/inner.git');
        git(nested, 'config', 'branch.feature/inner.remote', 'origin');
        git(nested, 'update-ref', 'refs/remotes/origin/release', 'HEAD');
        git(nested, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/release');
        const result = await resolveRepository(path.join(nested, 'file #.ts'));
        assert.equal(realpathSync(result.root), realpathSync(nested));
        assert.equal(result.filePath, 'file #.ts');
        assert.equal(result.branch, 'feature/inner');
        assert.equal(result.upstreamRemote, 'origin');
        assert.equal(await result.git.config('missing.key'), undefined);
        const worktree = path.join(temporary, 'worktree');
        git(nested, 'worktree', 'add', '-b', 'worktree-branch', worktree);
        const linked = await resolveRepository(path.join(worktree, 'file #.ts'));
        assert.equal(realpathSync(linked.root), realpathSync(worktree));
        assert.equal(linked.branch, 'worktree-branch');
        git(worktree, 'checkout', '--detach');
        assert.equal((await resolveRepository(path.join(worktree, 'file #.ts'))).branch, '');
        await assert.rejects(new Git(temporary).required(['rev-parse', '--show-toplevel']), /Git rev-parse failed/);
        await assert.rejects(new Git(temporary, 'nonexistent-git-executable').config('missing.key'), /Git config failed/);
        assert.equal(git(nested, 'status', '--porcelain'), '');
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});
