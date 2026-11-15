/** Changes GitLab merge requests through `glab`. */
import { actionFailureOf, failureOf } from '../../core/json.js';
import { checkedRepository, isCommit } from './urls.js';
/** Changes merge requests of the configured GitLab hosts. */
export class GitLabWriter {
    run;
    hosts;
    /**
     * @param run - runner for `glab`.
     * @param hosts - lowercase hosts this provider serves.
     */
    constructor(run, hosts) {
        this.run = run;
        this.hosts = hosts;
    }
    /**
     * Mark a draft merge request ready for review.
     * @param ref - merge request to update.
     * @param signal - cancellation of the request.
     * @returns undefined once GitLab accepted it, or why it did not.
     */
    async markReady(ref, signal) {
        const repository = checkedRepository(ref);
        return await this.act(repository.host, [
            'mr', 'update', String(ref.number), '--ready', '--yes', '-R', repositoryUrl(repository),
        ], signal);
    }
    /**
     * Merge a merge request while its head is still `request.headSha`.
     * @param ref - merge request to merge.
     * @param request - merge method and the confirmed head commit.
     * @param signal - cancellation of the request.
     * @returns undefined once GitLab merged it, or why it did not.
     */
    async merge(ref, request, signal) {
        const repository = checkedRepository(ref);
        if (!isCommit(request.headSha))
            throw new Error(`gitall: invalid head commit ${JSON.stringify(request.headSha)}`);
        const args = ['mr', 'merge', String(ref.number), '--yes', '--auto-merge=false', '-R', repositoryUrl(repository), '--sha', request.headSha];
        if (request.method === 'squash')
            args.push('--squash');
        else if (request.method === 'rebase')
            args.push('--rebase');
        return await this.act(repository.host, args, signal);
    }
    /** Run one changing `glab` command; a refusal becomes an action failure. */
    async act(host, args, signal) {
        if (!this.hosts.has(host.toLowerCase()))
            return { code: 'failed', message: `gitall: host ${JSON.stringify(host)} is not configured for gitlab` };
        let output;
        try {
            output = await this.run(args, signal);
        }
        catch (error) {
            if (signal.aborted)
                throw signal.reason;
            return writeFailureOf(error);
        }
        return output.exitCode === 0 ? undefined : actionFailureOf(output);
    }
}
function writeFailureOf(error) {
    const failure = failureOf(error);
    return failure.code === 'unauthenticated'
        ? { code: 'unauthenticated', message: failure.message }
        : { code: 'failed', message: failure.message };
}
function repositoryUrl(repository) {
    return `https://${repository.host}/${repository.owner}/${repository.name}`;
}
