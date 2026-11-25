const path = require('node:path');
const { createVSIX } = require('@vscode/vsce');
const { name, version } = require('../package.json');

createVSIX({
    packagePath: path.join('dist', `${name}-${version}.vsix`),
    skipLicense: true,
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
