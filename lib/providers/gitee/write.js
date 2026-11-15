/** Changes Gitee pull requests through `gitee api`. */
import { actionFailureOf, asRecord, failureOf, parseJson, refusalOf, text } from '../../core/json.js';
import { checkedRepository, isCommit } from './urls.js';
/** Changes pull requests of the configured Gitee hosts. */
export class GiteeWriter {
    run;
    hosts;
    /**
     * @param run - runner for `gitee`.
     * @param hosts - lowercase hosts this provider serves.
     */
    constructor(run, hosts) {
        this.run = run;
        this.hosts = hosts;
    }
    /**
     * Clear a pull request's draft flag.
     * @param ref - pull request to update.
     * @param signal - cancellation of the request.
     * @returns undefined once Gitee accepted it, or why it did not.
     */
    async markReady(ref, signal) {
        const repository = checkedRepository(ref);
        return await this.write(repository.host, [
            'api', '-X', 'PATCH', `/repos/${repository.owner}/${repository.name}/pulls/${ref.number}`,
            '--body', '{"draft":false}', '--hostname', repository.host, '--no-tui',
        ], signal);
    }
    /**
     * Merge a pull request while its head is still `request.headSha`. Gitee's
     * merge endpoint cannot name the confirmed head, so the head is read first.
     * @param ref - pull request to merge.
     * @param request - merge method and the confirmed head commit.
     * @param signal - cancellation of the request.
     * @returns undefined once Gitee merged it, or why it did not.
     */
    async merge(ref, request, signal) {
        const repository = checkedRepository(ref);
        if (!isCommit(request.headSha))
            throw new Error(`gitall: invalid head commit ${JSON.stringify(request.headSha)}`);
        if (request.method === 'rebase')
            return { code: 'failed', message: 'Gitee provider offers only merge and squash merges' };
        if (!this.hosts.has(repository.host.toLowerCase())) {
            return { code: 'failed', message: `gitall: host ${JSON.stringify(repository.host)} is not configured for gitee` };
        }
        const current = await this.readHead(ref, signal);
        if (typeof current !== 'string')
            return { code: current.code === 'unauthenticated' ? 'unauthenticated' : 'failed', message: current.message };
        if (current.toLowerCase() !== request.headSha.toLowerCase()) {
            return { code: 'stale', message: `the pull request head moved from ${request.headSha} to ${current}` };
        }
        return await this.write(repository.host, [
            'api', '-X', 'PUT', `/repos/${repository.owner}/${repository.name}/pulls/${ref.number}/merge`,
            '-f', `merge_method=${request.method}`, '--hostname', repository.host, '--no-tui',
        ], signal);
    }
    /** Read the current head commit, or why it could not be read. */
    async readHead(ref, signal) {
        let output;
        try {
            output = await this.run([
                'api', `/repos/${ref.repository.owner}/${ref.repository.name}/pulls/${ref.number}`,
                '--hostname', ref.repository.host, '--no-tui',
            ], signal);
        }
        catch (error) {
            if (signal.aborted)
                throw signal.reason;
            return failureOf(error);
        }
        if (output.exitCode !== 0)
            return refusalOf(output);
        const parsed = asRecord(parseJson(output.stdout));
        const head = parsed === undefined ? undefined : asRecord(parsed.head);
        return text(head?.sha) ?? { code: 'unavailable', message: 'unexpected Gitee response to the pull request read' };
    }
    /** Run one changing `gitee` command; a refusal becomes an action failure. */
    async write(host, args, signal) {
        if (!this.hosts.has(host.toLowerCase()))
            return { code: 'failed', message: `gitall: host ${JSON.stringify(host)} is not configured for gitee` };
        let output;
        try {
            output = await this.run(args, signal);
        }
        catch (error) {
            if (signal.aborted)
                throw signal.reason;
            const failure = failureOf(error);
            return failure.code === 'unauthenticated'
                ? { code: 'unauthenticated', message: failure.message }
                : { code: 'failed', message: failure.message };
        }
        return output.exitCode === 0 ? undefined : actionFailureOf(output);
    }
}
