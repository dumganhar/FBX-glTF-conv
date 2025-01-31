const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const IsWindows = process.platform === 'win32';
const IsMacOS = process.platform === 'darwin';
const IsLinux = process.platform === 'linux';
const is64BitOperatingSystem = process.arch === 'x64';
const CurrentDir = path.dirname(__filename);

const cmakeInstallPrefix = 'out/install';
let ArtifactPath = '';
let IncludeDebug = false;
let Version = '';

function execWithLog(cmd) {
    try {
        const output = execSync(cmd, { stdio: 'inherit' });
        if (output) {
            console.log(output.toString());
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        console.error(`Command stderr: ${error.stderr.toString()}`);
    }
}

function parseArgs() {
    const args = process.argv.slice(2); // Exclude first two arguments: node command and the path of this script.

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-ArtifactPath':
                ArtifactPath = args[++i];
                break;
            case '-IncludeDebug':
                IncludeDebug = true;
                break;
            case '-Version':
                Version = args[++i];
                break;
            default:
                break;
        }
    }
}

function printEnvironments() {
    console.log(`
        IsWindows: ${IsWindows}
        IsMacOS: ${IsMacOS}
        IsLinux: ${IsLinux}
        Is64BitOperatingSystem: ${is64BitOperatingSystem}
        Current working directory: ${process.cwd()}
        ArtifactPath: ${ArtifactPath}
        IncludeDebug: ${IncludeDebug}
        Version: ${Version}
    `);
}

function installVcpkg() {
    const vcpkgUrl = 'https://github.com/microsoft/vcpkg.git';
    execSync(`git clone ${vcpkgUrl}`);
    
    if (IsWindows) {
        execSync(`./vcpkg/bootstrap-vcpkg.bat`);
    } else if (IsMacOS || IsLinux) {
        execSync(`./vcpkg/bootstrap-vcpkg.sh`);
        if (IsMacOS) {
            // childProcess.spawnSync('xcode-select', ['--install']);
        }
    } else {
        console.error('vcpkg is not available on target platform.');
        process.exit(1);
    }
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);

        const request = https.get(url, (response) => {
            // Check for redirection
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Follow the redirect
                downloadFile(response.headers.location, dest)
                    .then(resolve)
                    .catch(reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }
        });

        request.on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });

        request.end();
    });
}

async function installFbxSdk() {
    const fbxSdkHome = path.join(process.cwd(), 'fbxsdk', 'Home');
    fs.mkdirSync('fbxsdk', { recursive: true });

    if (IsWindows) {
        const fbxSdkUrl = 'https://www.autodesk.com/content/dam/autodesk/www/adn/fbx/2020-2-1/fbx202021_fbxsdk_vs2019_win.exe';
        const fbxSdkWindowsInstaller = path.join('fbxsdk', 'fbxsdk.exe');
        
        await downloadFile(fbxSdkUrl, fbxSdkWindowsInstaller);
        execSync(`start /wait ${fbxSdkWindowsInstaller} /S /D=${fbxSdkHome}`);
    } else if (IsMacOS) {
        const fbxSdkUrl = 'https://www.autodesk.com/content/dam/autodesk/www/adn/fbx/2020-2-1/fbx202021_fbxsdk_clang_mac.pkg.tgz';
        const fbxSdkVersion = '2020.2.1';
        const fbxSdkMacOSTarball = path.join('fbxsdk', 'fbxsdk.pkg.tgz');
        
        console.log('Start downloading fbx');
        try {
            await downloadFile(fbxSdkUrl, fbxSdkMacOSTarball);
        } catch (e) {
            console.log('download fbx error: ' + e);
        }
        
        console.log('End of downloading fbx');
        execSync(`tar -zxvf ${fbxSdkMacOSTarball} -C fbxsdk`);
        const fbxSdkMacOSPkgFile = fs.readdirSync('fbxsdk').find(file => file.endsWith('.pkg'));
        console.log(`FBX SDK MacOS pkg: ${fbxSdkMacOSPkgFile}`);
        execSync(`sudo installer -pkg fbxsdk/${fbxSdkMacOSPkgFile} -target /`);
        fs.symlinkSync(`/Applications/Autodesk/FBX SDK/${fbxSdkVersion}`, 'fbxsdk/Home');
    } else if (IsLinux) {
        const fbxSdkUrl = 'https://www.autodesk.com/content/dam/autodesk/www/adn/fbx/2020-2-1/fbx202021_fbxsdk_linux.tar.gz';
        const fbxSdkTarball = path.join('fbxsdk', 'fbxsdk.tar.gz');
        
        console.log(`Downloading FBX SDK tar ball from ${fbxSdkUrl} ...`);
        await downloadFile(fbxSdkUrl, fbxSdkTarball);
        execSync(`tar -zxvf ${fbxSdkTarball} -C fbxsdk`);
        
        const fbxSdkInstallationProgram = path.join('fbxsdk', 'fbx202021_fbxsdk_linux');
        execSync(`chmod ugo+x ${fbxSdkInstallationProgram}`);
        
        const fbxSdkHomeLocation = path.join(process.env.HOME, 'fbxsdk', 'install');
        console.log(`Installing from ${fbxSdkInstallationProgram}...`);
        fs.mkdirSync(fbxSdkHomeLocation, { recursive: true });

        // This is really a HACK way after many tries...
        execSync(`yes yes | ${fbxSdkInstallationProgram} ${fbxSdkHomeLocation}`);
        console.log('');

        console.log(`Installation finished(${fbxSdkHomeLocation}).`);
    } else {
        console.error('FBXSDK is not available on target platform.');
        process.exit(1);
    }
    return fbxSdkHome;
}

function installDependenciesForMacOS() {
    // Download both x86-64 and arm-64 libs and merge them into a uniform binary.
    // https://www.f-ax.de/dev/2022/11/09/how-to-use-vcpkg-with-universal-binaries-on-macos/
    const dependencies = ['libxml2', 'zlib', 'nlohmann-json', 'fmt', 'cppcodec', 'range-v3', 'cxxopts', 'glm', 'doctest', 'utfcpp'];
    for (let i = 0, len = dependencies.length; i < len; ++i) {
        const libName = dependencies[i];
        execSync(`./vcpkg/vcpkg install --triplet=x64-osx ${libName}`);
        execSync(`./vcpkg/vcpkg install --triplet=arm64-osx ${libName}`);
    }
    execSync(`python3 ./CI/lipo-dir-merge.py ./vcpkg/installed/arm64-osx ./vcpkg/installed/x64-osx ./vcpkg/installed/uni-osx`);
}

function installDependencies() {
    if (IsMacOS) {
        installDependenciesForMacOS();
    }
    else {
        execSync('./vcpkg/vcpkg install');
    }
}

async function runCMake(buildType) {
    console.log(`Build ${buildType} ...`);
    const cmakeBuildDir = `out/build/${buildType}`;

    const polyfillsStdFileSystem = IsWindows ? 'OFF' : 'ON';
    const defineVersion = Version ? `-DFBX_GLTF_CONV_CLI_VERSION=${Version}` : '';

    // https://www.f-ax.de/dev/2022/11/09/how-to-use-vcpkg-with-universal-binaries-on-macos/
    if (IsMacOS) {
        execWithLog(`cmake -DCMAKE_TOOLCHAIN_FILE='vcpkg/scripts/buildsystems/vcpkg.cmake' \
                        -DCMAKE_PREFIX_PATH='./vcpkg/installed/uni-osx' \
                        -DVCPKG_TARGET_TRIPLET='uni-osx' \
                        -DCMAKE_OSX_ARCHITECTURES='x86_64;arm64' \
                        -DCMAKE_BUILD_TYPE='${buildType}' \
                        -DCMAKE_INSTALL_PREFIX='${cmakeInstallPrefix}/${buildType}' \
                        -DFbxSdkHome:STRING='${fbxSdkHome}' \
                        -DPOLYFILLS_STD_FILESYSTEM=${polyfillsStdFileSystem} \
                        ${defineVersion} \
                        -S. -B${cmakeBuildDir}`);
    } else {
        execSync(`cmake -DCMAKE_TOOLCHAIN_FILE=vcpkg/scripts/buildsystems/vcpkg.cmake 
                        -DCMAKE_BUILD_TYPE=${buildType} 
                        -DCMAKE_INSTALL_PREFIX=${cmakeInstallPrefix}/${buildType} 
                        -DFbxSdkHome:STRING=${fbxSdkHome} 
                        -DPOLYFILLS_STD_FILESYSTEM=${polyfillsStdFileSystem} 
                        ${defineVersion} 
                        -S. -B${cmakeBuildDir}`);
    }

    execWithLog(`cmake --build ${cmakeBuildDir} --config ${buildType}`);

    if (IsWindows) {
        execSync(`cmake --build ${cmakeBuildDir} --config ${buildType} --target install`);
    } else {
        execWithLog(`cmake --install ${cmakeBuildDir}`);
    }
}

function build() {
    const cmakeBuildTypes = ['Release'];
    if (IncludeDebug) {
        cmakeBuildTypes.push('Debug');
    }

    for (const buildType of cmakeBuildTypes) {
        runCMake(buildType);
    }

    if (!fs.existsSync(cmakeInstallPrefix) || !fs.lstatSync(cmakeInstallPrefix).isDirectory()) {
        console.error('Installation failed.');
        process.exit(-1);
    }
    
    if (ArtifactPath) {
        const archivePath = path.join(ArtifactPath, 'archive.zip');
        execSync(`zip -r ${archivePath} ${cmakeInstallPrefix}`);
    }
}

parseArgs();
printEnvironments();
installFbxSdk();
installVcpkg();
installDependencies();
build();
