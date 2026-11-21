import assert from "node:assert/strict";
import test from "node:test";
import { finishProductionRollout } from "../../scripts/production-rollout";

const release = {
  token: "rollout-test-token",
  teamId: "team_redtally",
  projectId: "prj_redtally",
  deploymentId: "dpl_release",
  commit: "a".repeat(40),
};

const domain = "redtally.vercel.app";
const previousDeploymentId = "dpl_previous";
const projectPath = `/v9/projects/${release.projectId}`;
const deploymentPath = `/v13/deployments/${release.deploymentId}`;
const aliasPath = `/v4/aliases/${domain}`;
const promotePath = `/v10/projects/${release.projectId}/promote/${release.deploymentId}`;
const unpausePath = `/v1/projects/${release.projectId}/unpause`;

function mockVercel({
  paused = true,
  bindings = [release.deploymentId],
  aliasProjectId = release.projectId,
  candidateCommit = release.commit,
  bindingAfterProbe = undefined as string | undefined,
  promoteStatus = 202,
  unpauseStatus = 200 as number | null,
  probes = [{ status: 200, headers: {} as Record<string, string> }],
} = {}) {
  let aliasesRead = 0;
  let probesRead = 0;
  let boundDeploymentId = bindings[0];
  const operations: string[] = [];
  const aliasBindings: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    operations.push(`${method} ${url.pathname}`);

    if (url.hostname === domain) {
      assert.equal(url.pathname, "/sign-in");
      assert.equal(url.protocol, "https:");
      assert.equal(method, "GET");
      assert.equal(init?.redirect, "manual");
      assert.notEqual(url.search, "", "Probe the public URL with a cache-busting parameter");
      assert.equal(headers.has("authorization"), false, "The Vercel token must stay on the API origin");
      const probe = probes[Math.min(probesRead++, probes.length - 1)];
      return new Response("sign-in response", probe);
    }

    assert.equal(url.origin, "https://api.vercel.com");
    assert.equal(url.searchParams.get("teamId"), release.teamId);
    assert.equal(headers.get("authorization"), `Bearer ${release.token}`);
    switch (`${method} ${url.pathname}`) {
      case `GET ${projectPath}`:
        return Response.json({
          id: release.projectId,
          paused,
          autoAssignCustomDomains: !paused,
          targets: { production: { id: boundDeploymentId } },
        });
      case `GET ${deploymentPath}`:
        assert.equal(url.searchParams.get("withGitRepoInfo"), "true");
        return Response.json({
          id: release.deploymentId,
          projectId: release.projectId,
          target: "production",
          readyState: "READY",
          meta: { redtallyReleaseSha: candidateCommit },
          alias: [],
        });
      case `GET ${aliasPath}`:
        boundDeploymentId = (probesRead > 0 ? bindingAfterProbe : undefined)
          ?? bindings[Math.min(aliasesRead++, bindings.length - 1)];
        aliasBindings.push(boundDeploymentId);
        return Response.json({ alias: domain, projectId: aliasProjectId, deploymentId: boundDeploymentId });
      case `POST ${promotePath}`:
        assert(paused, "Promotion must happen while traffic is paused");
        return new Response(null, { status: promoteStatus });
      case `POST ${unpausePath}`:
        assert.equal(boundDeploymentId, release.deploymentId, "Production must point at the release before unpause");
        paused = false;
        if (unpauseStatus === null) throw new TypeError("Connection reset after unpausing");
        return new Response(null, { status: unpauseStatus });
      default:
        assert.fail(`Unexpected operation ${method} ${url.pathname}`);
    }
  };

  const complete = (timeoutMs = 1_000) => finishProductionRollout(release, { fetcher, timeoutMs, pollMs: 1 });
  const writes = () => operations.filter((operation) => operation.startsWith("POST "));
  return { aliasBindings, operations, complete, writes };
}

test("promotion waits for the production alias despite an empty deployment alias array", async () => {
  const rollout = mockVercel({
    bindings: [previousDeploymentId, previousDeploymentId, release.deploymentId],
    probes: [
      { status: 503, headers: { "x-vercel-error": "DEPLOYMENT_PAUSED" } },
      { status: 302, headers: { location: "/other" } },
      { status: 200, headers: { "x-vercel-error": "DEPLOYMENT_PAUSED" } },
      { status: 200, headers: {} },
    ],
  });

  await rollout.complete();

  assert.deepEqual(rollout.writes(), [`POST ${promotePath}`, `POST ${unpausePath}`]);
  assert.deepEqual(rollout.aliasBindings.slice(0, 3), [previousDeploymentId, previousDeploymentId, release.deploymentId]);
  assert.equal(rollout.operations.filter((operation) => operation === "GET /sign-in").length, 4);
  assert(rollout.operations.lastIndexOf(`GET ${aliasPath}`) > rollout.operations.lastIndexOf("GET /sign-in"));
});

for (const [failure, unpauseStatus] of [["HTTP 503", 503], ["a connection reset", null]] as const) {
  test(`alias and public health verify promotion after HTTP 409 and unpause after ${failure}`, async () => {
    const rollout = mockVercel({
      bindings: [previousDeploymentId, previousDeploymentId, release.deploymentId],
      promoteStatus: 409,
      unpauseStatus,
    });

    await rollout.complete();

    assert.deepEqual(rollout.writes(), [`POST ${promotePath}`, `POST ${unpausePath}`]);
    assert(rollout.operations.includes("GET /sign-in"));
    assert(rollout.operations.lastIndexOf(`GET ${aliasPath}`) > rollout.operations.lastIndexOf("GET /sign-in"));
  });
}

test("a permission error during promotion stops before unpausing", async () => {
  const rollout = mockVercel({ bindings: [previousDeploymentId], promoteStatus: 403 });

  await assert.rejects(rollout.complete(), /HTTP 403/i);

  assert.deepEqual(rollout.writes(), [`POST ${promotePath}`]);
  assert(!rollout.operations.includes("GET /sign-in"));
});

test("an unpaused project serving a different deployment is left alone", async () => {
  const rollout = mockVercel({ paused: false, bindings: [previousDeploymentId] });

  await assert.rejects(rollout.complete(), /project is not paused/i);

  assert.deepEqual(rollout.writes(), []);
  assert(!rollout.operations.includes("GET /sign-in"));
});

test("an alias on a different project blocks promotion and unpause", async () => {
  const rollout = mockVercel({ aliasProjectId: "prj_unrelated" });

  await assert.rejects(rollout.complete(), /expected Vercel project/i);

  assert.deepEqual(rollout.writes(), []);
});

test("a deployment built from a different commit blocks promotion and unpause", async () => {
  const rollout = mockVercel({ candidateCommit: "b".repeat(40), bindings: [previousDeploymentId] });

  await assert.rejects(rollout.complete(), /not a ready production deployment/i);

  assert.deepEqual(rollout.writes(), []);
});

test("traffic stays paused if promotion never moves the production alias", async () => {
  const rollout = mockVercel({ bindings: [previousDeploymentId] });

  await assert.rejects(rollout.complete(100), /timed out waiting/i);

  assert.deepEqual(rollout.writes(), [`POST ${promotePath}`]);
  assert(!rollout.operations.includes("GET /sign-in"));
});

test("an already promoted rollout can resume and then rerun without further writes", async () => {
  const rollout = mockVercel();

  await rollout.complete();
  await rollout.complete();

  assert.deepEqual(rollout.writes(), [`POST ${unpausePath}`]);
  assert.equal(rollout.operations.filter((operation) => operation === "GET /sign-in").length, 2);
});

test("an HTTP 200 does not pass verification if the alias drifted after resume", async () => {
  const rollout = mockVercel({ bindingAfterProbe: previousDeploymentId });

  await assert.rejects(rollout.complete(), /switched to dpl_previous during the production health check/i);

  assert.deepEqual(rollout.writes(), [`POST ${unpausePath}`]);
  assert(rollout.operations.lastIndexOf(`GET ${aliasPath}`) > rollout.operations.lastIndexOf("GET /sign-in"));
});
