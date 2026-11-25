export type Provider = 'auto' | 'github' | 'gitlab' | 'bitbucket' | 'azure';
export type Action = 'repository' | 'file' | 'compare';
export type Templates = Partial<Record<Action, string>>;

export interface Remote {
    repository: string;
    provider: Provider;
}

export function parseRemote(raw: string, override: Provider = 'auto'): Remote {
    let url: URL;
    const scp = /^(?:[^@/:]+@)?([^/:]+):(.+)$/.exec(raw);
    try {
        url = new URL(raw.includes('://') ? raw : scp ? `ssh://${scp[1]}/${scp[2]}` : raw);
    } catch {
        throw new Error('Remote is not a supported HTTPS or SSH repository URL.');
    }
    if (!['https:', 'http:', 'ssh:'].includes(url.protocol) || !url.hostname || url.search || url.hash) {
        throw new Error('Remote must be an HTTP(S) or SSH repository URL without query parameters or fragments.');
    }
    let segments: string[];
    try {
        segments = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '').split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
        throw new Error('Remote contains invalid URL encoding.');
    }
    if (segments.length < 2 || segments.some(segment => /[\\/?#]/.test(segment) || segment === '.' || segment === '..')) {
        throw new Error('Remote does not contain a valid repository path.');
    }
    let host = url.hostname.toLowerCase();
    if (host === 'ssh.github.com') host = 'github.com';
    if (host === 'ssh.dev.azure.com') {
        if (segments.length !== 4 || segments[0] !== 'v3') throw new Error('Invalid Azure DevOps SSH remote.');
        segments = [segments[1]!, segments[2]!, '_git', segments[3]!];
        host = 'dev.azure.com';
    }
    const detected: Provider = host === 'github.com' ? 'github'
        : host === 'gitlab.com' ? 'gitlab'
        : host === 'bitbucket.org' ? 'bitbucket'
        : host === 'dev.azure.com' || host.endsWith('.visualstudio.com') ? 'azure' : 'auto';
    const port = url.protocol === 'ssh:' ? '' : url.port ? `:${url.port}` : '';
    return {
        repository: `https://${host}${port}/${segments.map(encodeURIComponent).join('/')}`,
        provider: override === 'auto' ? detected : override,
    };
}

export function buildUrl(remote: Remote, action: Action, branch: string, filePath: string, base: string, templates: Templates = {}): string {
    const tokens: Record<string, string> = {
        repository: remote.repository,
        branch: encodeURIComponent(branch),
        base: encodeURIComponent(base),
        path: filePath.split('/').map(encodeURIComponent).join('/'),
    };
    let template = templates[action];
    if (template === undefined) {
        if (action === 'repository') template = '{repository}';
        else if (remote.provider === 'github') template = action === 'file'
            ? '{repository}/blob/{branch}/{path}' : '{repository}/compare/{base}...{branch}';
        else if (remote.provider === 'gitlab') template = action === 'file'
            ? '{repository}/-/blob/{branch}/{path}' : '{repository}/-/compare/{base}...{branch}';
        else if (remote.provider === 'bitbucket') template = action === 'file'
            ? '{repository}/src/{branch}/{path}' : '{repository}/branches/compare/{branch}%0D{base}';
        else if (remote.provider === 'azure') template = action === 'file'
            ? '{repository}?path={path}&version=GB{branch}&_a=contents'
            : '{repository}?_a=branchCompare&baseVersion=GB{base}&targetVersion=GB{branch}';
        else throw new Error('Unknown repository provider. Set openFileInRepository.provider or configure urlTemplates for this host.');
    }
    // Azure paths are query values, rather than URL path segments.
    if (remote.provider === 'azure' && templates[action] === undefined) tokens.path = encodeURIComponent(`/${filePath}`);
    const result = template.replace(/\{([^{}]+)\}/g, (_, token: string) => {
        if (!Object.hasOwn(tokens, token)) throw new Error(`Unknown URL template token: ${token}.`);
        return tokens[token]!;
    });
    let url: URL;
    try {
        url = new URL(result);
    } catch {
        throw new Error('Repository URL template must produce an absolute HTTPS URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('Repository links must use HTTPS without credentials.');
    }
    return url.href;
}
