
const ps = require('path');

module.exports = {
    tool: process.platform === 'win32' ?
        ps.join(__dirname, 'bin', 'win32', 'FBX-glTF-conv.exe') :
        ps.join(__dirname, 'bin', 'darwin', 'FBX-glTF-conv'),
};
