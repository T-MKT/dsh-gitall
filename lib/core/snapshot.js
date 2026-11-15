/** Builds a provider-neutral change request snapshot from the fields one host reports. */
/**
 * Build a snapshot, filling every section these providers do not read with its
 * unimplemented default.
 * @param ref - change request the snapshot describes.
 * @param fields - fields the host reported.
 * @returns the complete snapshot.
 */
export function snapshotOf(ref, fields) {
    return {
        ref,
        url: fields.url,
        title: fields.title,
        state: fields.state,
        draft: fields.draft,
        author: fields.author,
        headBranch: fields.headBranch,
        headSha: fields.headSha,
        baseBranch: fields.baseBranch,
        ...fields.baseSha === undefined ? {} : { baseSha: fields.baseSha },
        additions: fields.additions,
        deletions: fields.deletions,
        mergeability: fields.mergeability,
        mergeReady: fields.mergeReady,
        mergeMethods: fields.mergeMethods,
        branchUpdates: [],
        reviewDecision: 'none',
        reviewers: [],
        reviewersTruncated: false,
        canRequestReviews: false,
        checks: fields.checks,
        checksRollup: checksRollupOf(fields.checks),
        checksTruncated: false,
        canRerunChecks: false,
        unresolvedThreads: 0,
        threadsTruncated: false,
        closingIssues: [],
        closingIssuesTruncated: false,
        updatedAt: fields.updatedAt,
        closedAt: fields.closedAt,
    };
}
/**
 * Combine the outcomes of all checks.
 * @param checks - checks on the head commit, in host order.
 * @returns `none` without checks, `failure` when any failed, `pending` when any is still running, and `success` otherwise.
 */
export function checksRollupOf(checks) {
    if (checks.length === 0)
        return 'none';
    if (checks.some(check => check.state === 'failure'))
        return 'failure';
    if (checks.some(check => check.state === 'pending'))
        return 'pending';
    return 'success';
}
