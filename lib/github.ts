const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|py|java|go|rs|cs|cpp|c|sql)$/i;
const EXCLUDED_PATHS =
  /(^|\/)(node_modules|dist|build|vendor|\.next|coverage|test|tests|__tests__|migrations|generated|\.github)(\/|$)|(\.min\.|\.spec\.|\.test\.|\.d\.ts$)/i;

export type SourceFile = {
  path: string;
  content: string;
};

export type RepositorySnapshot = {
  name: string;
  sha: string;
  files: SourceFile[];
};

export class GitHubFailure extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}

export function parseRepositoryUrl(input: string) {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new GitHubFailure("Enter a valid GitHub repository URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new GitHubFailure(
      "Use a public https://github.com/owner/repository URL.",
    );
  }

  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  if (parts.length !== 2) {
    throw new GitHubFailure("Paste a repository URL, not a file or folder URL.");
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");

  if (
    !/^[a-zA-Z0-9-]{1,39}$/.test(owner) ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) ||
    repo === "." ||
    repo === ".."
  ) {
    throw new GitHubFailure("Invalid repository owner or name.");
  }

  return { owner, repo };
}

async function githubJson<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "explain-your-build",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  let response: Response;

  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new GitHubFailure("GitHub is unreachable right now.", 502);
  }

  if (response.status === 404) {
    throw new GitHubFailure("Repository not found or not public.", 404);
  }

  if (response.status === 403 || response.status === 429) {
    throw new GitHubFailure("GitHub access denied or rate limited.", 429);
  }

  if (!response.ok) {
    throw new GitHubFailure("GitHub returned an unexpected response.", 502);
  }

  return (await response.json()) as T;
}

export async function analyzeRepository(
  input: string,
): Promise<RepositorySnapshot> {
  const { owner, repo } = parseRepositoryUrl(input);
  const slug = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const info = await githubJson<{
    private: boolean;
    default_branch: string;
    size: number;
  }>(`/repos/${slug}`);

  if (info.private) {
    throw new GitHubFailure(
      "Private repositories require a future GitHub App integration.",
      403,
    );
  }

  if (info.size > 150_000) {
    throw new GitHubFailure("This repository exceeds the MVP size limit.");
  }

  const commit = await githubJson<{ sha: string }>(
    `/repos/${slug}/commits/${encodeURIComponent(info.default_branch)}`,
  );

  if (!/^[0-9a-f]{40}$/.test(commit.sha)) {
    throw new GitHubFailure("Unable to pin a repository revision.");
  }

  const tree = await githubJson<{
    truncated: boolean;
    tree: Array<{ path: string; type: string; size?: number }>;
  }>(`/repos/${slug}/git/trees/${commit.sha}?recursive=1`);

  if (tree.truncated) {
    throw new GitHubFailure("This repository tree exceeds the MVP size limit.");
  }

  const candidates = tree.tree
    .filter(
      (file) =>
        file.type === "blob" &&
        Boolean(file.size) &&
        (file.size ?? 0) <= 12_000 &&
        SOURCE_EXTENSIONS.test(file.path) &&
        !EXCLUDED_PATHS.test(file.path) &&
        !file.path.startsWith("."),
    )
    .map((file) => ({
      ...file,
      score:
        (/((src|app|api|lib|server|services)\/)/i.test(file.path) ? 5 : 0) +
        (/route|service|controller|handler|auth|database/i.test(file.path)
          ? 4
          : 0) -
        file.path.split("/").length,
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 6);

  if (!candidates.length) {
    throw new GitHubFailure("No supported source files were found.");
  }

  const fetched = await Promise.allSettled(
    candidates.map(async (file) => {
      const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(
        `https://raw.githubusercontent.com/${slug}/${commit.sha}/${encodedPath}`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (
        !response.ok ||
        Number(response.headers.get("content-length") ?? "0") > 12_000
      ) {
        return null;
      }

      const content = await response.text();

      if (content.length > 12_000 || content.includes("\u0000")) {
        return null;
      }

      return { path: file.path, content };
    }),
  );

  const files: SourceFile[] = [];
  let totalLength = 0;

  for (const result of fetched) {
    if (result.status !== "fulfilled" || !result.value) {
      continue;
    }

    if (totalLength + result.value.content.length > 42_000) {
      continue;
    }

    files.push(result.value);
    totalLength += result.value.content.length;
  }

  if (!files.length) {
    throw new GitHubFailure("Could not read supported source files.");
  }

  return {
    name: `${owner}/${repo}`,
    sha: commit.sha,
    files,
  };
}
