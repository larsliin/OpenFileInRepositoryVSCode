const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { runTests } = require('@vscode/test-electron');

async function main() {
    const root = path.resolve(__dirname, '..', '.vscode-test');
    fs.mkdirSync(root, { recursive: true });
    const temporary = fs.mkdtempSync(path.join(root, 'repository-smoke-'));
    try {
        const fixture = path.join(temporary, 'workspace');
        fs.mkdirSync(fixture);
        const git = (...args) => execFileSync('git', ['-C', fixture, ...args], { stdio: 'pipe' });
        git('init', '-b', 'develop');
        fs.writeFileSync(path.join(fixture, 'selected file.ts'), 'export const selected = true;\n');
        fs.writeFileSync(path.join(fixture, 'active.ts'), 'export const active = true;\n');
        fs.writeFileSync(path.join(fixture, 'untracked.ts'), 'untracked\n');
        fs.mkdirSync(path.join(fixture, 'src'));
        fs.writeFileSync(path.join(fixture, 'src', 'nested.ts'), '  nested base\n\n');
        git('add', 'selected file.ts', 'active.ts', 'src');
        git('-c', 'user.name=Extension Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
        git('checkout', '-b', 'feature/links');
        fs.writeFileSync(path.join(fixture, 'selected file.ts'), 'export const selected = false;\n');
        git('add', 'selected file.ts');
        git('-c', 'user.name=Extension Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'feature change');
        git('remote', 'add', 'origin', 'git@github.com:example/repository.git');
        git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
        git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
        await runTests({
            extensionDevelopmentPath: path.resolve(__dirname, '..'),
            extensionTestsPath: path.resolve(__dirname, '..', 'out', 'test', 'extension.test.js'),
            vscodeExecutablePath: process.env.VSCODE_EXECUTABLE,
            extensionTestsEnv: { REPOSITORY_TEST_WORKSPACE: fixture },
            launchArgs: [
                fixture, '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
                '--user-data-dir', path.join(temporary, 'user-data'),
                '--extensions-dir', path.join(temporary, 'extensions'),
            ],
        });
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
