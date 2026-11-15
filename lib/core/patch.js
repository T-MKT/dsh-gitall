/** Composes per-file diffs into one unified patch with `a/` and `b/` path prefixes. */
/**
 * Compose one unified patch.
 * @param files - changed files in host order.
 * @returns the patch, one `diff --git` section per file, with `/dev/null` on the missing side of an added or removed file.
 */
export function unifiedPatch(files) {
    const parts = [];
    for (const file of files) {
        parts.push(`diff --git a/${file.oldPath} b/${file.newPath}\n`);
        parts.push(file.newFile === true ? '--- /dev/null\n' : `--- a/${file.oldPath}\n`);
        parts.push(file.deletedFile === true ? '+++ /dev/null\n' : `+++ b/${file.newPath}\n`);
        if (file.body.length === 0)
            continue;
        parts.push(file.body);
        if (!file.body.endsWith('\n'))
            parts.push('\n');
    }
    return parts.join('');
}
