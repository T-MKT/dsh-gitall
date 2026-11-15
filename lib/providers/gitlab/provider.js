/** GitLab implementation of the forge provider contract. */
import { GitLabReader } from './read.js';
import { parseMergeRequestUrl, parseRemoteUrl } from './urls.js';
import { GitLabWriter } from './write.js';
/** GitLab merge request provider reading through `glab`. */
export class GitLabProvider {
    forge = 'gitlab';
    hosts;
    reader;
    writer;
    /**
     * @param run - runner for `glab`.
     * @param settings - executable and served hosts.
     */
    constructor(run, settings) {
        this.hosts = new Set(settings.hosts.map(host => host.toLowerCase()));
        this.reader = new GitLabReader(run, this.hosts);
        this.writer = new GitLabWriter(run, this.hosts);
    }
    repositoryFromRemote(url) {
        const location = parseRemoteUrl(url);
        if (location === undefined || !this.hosts.has(location.host))
            return undefined;
        return { forge: this.forge, host: location.host, owner: location.owner, name: location.name };
    }
    changeRequestFromUrl(url) {
        const parsed = parseMergeRequestUrl(url);
        if (parsed === undefined || !this.hosts.has(parsed.host))
            return undefined;
        return { repository: { forge: this.forge, host: parsed.host, owner: parsed.owner, name: parsed.name }, number: parsed.number };
    }
    changeRequestUrl(ref) {
        const { host, owner, name } = ref.repository;
        return `https://${host}/${owner}/${name}/-/merge_requests/${ref.number}`;
    }
    async fetch(refs, signal) {
        return await this.reader.fetch(refs, signal);
    }
    async findByHead(repository, branch, signal) {
        return await this.reader.findByHead(repository, branch, signal);
    }
    async readiness(host, signal) {
        return await this.reader.readiness(host, signal);
    }
    async markReady(ref, signal) {
        return await this.writer.markReady(ref, signal);
    }
    async merge(ref, request, signal) {
        return await this.writer.merge(ref, request, signal);
    }
    async diff(ref, headSha, signal, base) {
        // The recorded base commit cannot shorten this read: the diffs endpoint always names the merge request's own diff.
        void base;
        return await this.reader.diff(ref, headSha, signal);
    }
    async fileText(ref, commit, path, signal) {
        return await this.reader.fileText(ref, commit, path, signal);
    }
    fileUrl(ref, commit, path) {
        const { host, owner, name } = ref.repository;
        return `https://${host}/${owner}/${name}/-/blob/${commit}/${encodePath(path)}`;
    }
}
function encodePath(path) {
    return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}
