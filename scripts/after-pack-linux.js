const fs = require("fs/promises");
const path = require("path");

const executableFiles = new Set([
    "mtkb",
    "chrome_crashpad_handler",
    "chrome-sandbox"
]);

async function normalizePermissions(directory, appOutDir) {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isSymbolicLink()) {
            continue;
        }

        if (entry.isDirectory()) {
            await fs.chmod(fullPath, 0o755);
            await normalizePermissions(fullPath, appOutDir);
            continue;
        }

        if (entry.isFile()) {
            const relativePath = path.relative(appOutDir, fullPath)
                .split(path.sep)
                .join("/");

            const mode = executableFiles.has(relativePath)
                ? 0o755
                : 0o644;

            await fs.chmod(fullPath, mode);
        }
    }
}

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== "linux") {
        return;
    }

    console.log("Normalizing Linux application file permissions...");

    await normalizePermissions(context.appOutDir, context.appOutDir);
};
