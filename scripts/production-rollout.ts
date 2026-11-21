import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const domain = "redtally.vercel.app";

type Release = { token: string; teamId: string; projectId: string; deploymentId: string; commit: string };
type RolloutOptions = { fetcher?: typeof fetch; timeoutMs?: number; pollMs?: number };

class RetryableRequestError extends Error {}

async function waitFor(
  check: () => Promise<string | null>, description: string, timeoutMs: number, pollMs: number, mutationIssue = "",
) {
  const deadline = performance.now() + timeoutMs;
  while (true) {
    let pending: string | null;
    try {
      pending = await check();
    } catch (error) {
      if (!(error instanceof RetryableRequestError)) throw error;
      pending = error.message;
    }
    if (pending === null) return;
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error(`Timed out waiting for ${description}. ${pending}${mutationIssue}`);
    await delay(Math.min(pollMs, remaining));
  }
}

export async function finishProductionRollout(
  { token, teamId, projectId, deploymentId, commit }: Release,
  { fetcher = fetch, timeoutMs = 120_000, pollMs = 1000 }: RolloutOptions = {},
) {
  if (!token.trim() || !/^team_[a-z0-9]+$/i.test(teamId) || !/^prj_[a-z0-9]+$/i.test(projectId)) {
    throw new Error("Set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID for the production project.");
  }
  if (!/^dpl_[a-z0-9]+$/i.test(deploymentId) || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error("Pass a staged deployment ID and the full Git commit SHA.");
  }

  async function request(url: URL, init: RequestInit = {}) {
    try {
      return await fetcher(url, { ...init, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
    } catch {
      throw new RetryableRequestError(`${init.method ?? "GET"} ${url.hostname}${url.pathname} failed to connect or timed out.`);
    }
  }

  async function vercel(route: string, method: "GET" | "POST" = "GET") {
    const url = new URL(route, "https://api.vercel.com");
    url.searchParams.set("teamId", teamId);
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (method === "POST") headers["content-type"] = "application/json";
    const response = await request(url, { method, headers, body: method === "POST" ? "{}" : undefined });
    if (response.ok && method === "GET") return response.json();
    await response.body?.cancel();
    if (response.ok) return;
    const message = `Vercel ${method} ${url.pathname} returned HTTP ${response.status}.`;
    if (response.status === 429 || response.status >= 500 || (method === "GET" && response.status === 404) ||
        (response.status === 409 && method === "POST" && route.startsWith("/v10/"))) {
      throw new RetryableRequestError(message);
    }
    throw new Error(message);
  }

  async function post(route: string) {
    try {
      await vercel(route, "POST");
      return "";
    } catch (error) {
      // A lost response or an in-flight promotion can still complete. Check the resulting state.
      if (!(error instanceof RetryableRequestError)) throw error;
      return ` ${error.message}`;
    }
  }

  async function getAliasDeployment() {
    // The deployment response's optional alias array can be empty after promotion.
    const alias = await vercel(`/v4/aliases/${domain}`);
    if (alias.alias !== domain || alias.projectId !== projectId || alias.redirect || alias.deletedAt) {
      throw new Error(`${domain} is not a deployment alias for the expected Vercel project.`);
    }
    if (typeof alias.deploymentId !== "string" || !alias.deploymentId) {
      throw new Error(`${domain} has no deployment ID in its Vercel alias record.`);
    }
    return alias.deploymentId as string;
  }

  const [deployment, project] = await Promise.all([
    vercel(`/v13/deployments/${deploymentId}?withGitRepoInfo=true`),
    vercel(`/v9/projects/${projectId}`),
  ]);
  const deploymentCommit = deployment.gitSource?.sha ?? deployment.meta?.githubCommitSha ?? deployment.meta?.redtallyReleaseSha;
  if (deployment.id !== deploymentId || deployment.projectId !== projectId ||
      deployment.target !== "production" || deployment.readyState !== "READY" || deploymentCommit !== commit) {
    throw new Error(`${deploymentId} is not a ready production deployment of ${commit} for ${projectId}.`);
  }

  const currentDeploymentId = await getAliasDeployment();
  if (currentDeploymentId !== deploymentId) {
    if (project.paused !== true) throw new Error(`${domain} points to ${currentDeploymentId} and the project is not paused.`);
    const promotionIssue = await post(`/v10/projects/${projectId}/promote/${deploymentId}`);
    await waitFor(async () => {
      const assigned = await getAliasDeployment();
      return assigned === deploymentId ? null : `${domain} still points to ${assigned}.`;
    }, `${domain} to point to ${deploymentId}`, timeoutMs, pollMs, promotionIssue);
  }

  const resumeIssue = project.paused === true ? await post(`/v1/projects/${projectId}/unpause`) : "";

  await waitFor(async () => {
    const url = new URL(`https://${domain}/sign-in`);
    url.searchParams.set("rolloutCheck", String(Date.now()));
    const response = await request(url);
    const vercelError = response.headers.get("x-vercel-error");
    await response.body?.cancel();
    if (response.status === 200 && !response.headers.has("x-vercel-error")) return null;
    return `/sign-in returned HTTP ${response.status}${vercelError ? ` (${vercelError})` : ""}.`;
  }, `a healthy public response from ${domain}`, timeoutMs, pollMs, resumeIssue);

  await waitFor(async () => {
    const assigned = await getAliasDeployment();
    if (assigned !== deploymentId) throw new Error(`${domain} switched to ${assigned} during the production health check.`);
    return null;
  }, `a final alias check for ${domain}`, timeoutMs, pollMs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [deploymentId = "", commit = ""] = process.argv.slice(2);
  finishProductionRollout({
    token: process.env.VERCEL_TOKEN ?? "",
    teamId: process.env.VERCEL_TEAM_ID ?? "",
    projectId: process.env.VERCEL_PROJECT_ID ?? "",
    deploymentId,
    commit,
  }).then(() => {
    console.log(`${domain} is serving ${deploymentId} (${commit}) and /sign-in returned HTTP 200.`);
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
