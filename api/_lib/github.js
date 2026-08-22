/* Git-backed CMS plumbing: reads/writes repo files through the GitHub
   contents API. Every admin edit becomes a commit on main, which triggers
   a Vercel redeploy — content history is git history. */

const API = 'https://api.github.com';

function config() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'pkenich/mt-peak-site';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) {
    const e = new Error('GITHUB_TOKEN is not configured — the admin panel needs it to save changes.');
    e.statusCode = 503;
    throw e;
  }
  return { token, repo, branch };
}

async function gh(path, opts = {}) {
  const { token } = config();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mt-peak-admin',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let msg = `GitHub API ${res.status}: ${detail.slice(0, 200)}`;
    if (res.status === 401) msg = 'GitHub token is invalid or expired. Generate a fresh fine-grained token (Contents: Read & write on this repo), update GITHUB_TOKEN in Vercel → Settings → Environment Variables, and redeploy.';
    else if (res.status === 403 || res.status === 404) msg = 'GitHub token lacks access to this repo. Give the token Contents: Read & write on ' + (process.env.GITHUB_REPO || 'the repo') + ', then redeploy.';
    const e = new Error(msg);
    e.statusCode = res.status === 401 || res.status === 403 ? 502 : res.status;
    throw e;
  }
  return res.json();
}

/* Returns { content: Buffer, sha } for a repo path at the branch head. */
export async function readRepoFile(path) {
  const { repo, branch } = config();
  const data = await gh(`/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${branch}`);
  return { content: Buffer.from(data.content, 'base64'), sha: data.sha };
}

/* Creates or updates a file with a single commit. */
export async function writeRepoFile(path, contentBuffer, message) {
  const { repo, branch } = config();
  let sha;
  try { sha = (await readRepoFile(path)).sha; } catch (e) { if (e.statusCode !== 404) throw e; }
  return gh(`/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      branch,
      content: contentBuffer.toString('base64'),
      ...(sha ? { sha } : {}),
      committer: { name: 'Mt. Peak Admin', email: 'admin@mtpeak.invalid' },
    }),
  });
}
