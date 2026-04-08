"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { FormEvent } from "react";

type SessionResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        id: string;
        doUserUuid: string;
        doTeamUuid: string;
        email?: string;
      };
    };

type DeploymentView = {
  id: string;
  status: string;
  region: string;
  sizeSlug: string;
  dropletName: string;
  publicIpv4?: string;
  sshTunnelCommand: string | null;
  uiIncludedInV1: boolean;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    id: string;
    ts: string;
    type: string;
    payload?: Record<string, unknown>;
  }>;
};

type LaunchpadShellProps = {
  apiBaseUrl: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
    throw new Error(payload?.message ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function LaunchpadShell({ apiBaseUrl }: LaunchpadShellProps) {
  const [session, setSession] = useState<SessionResponse>({ authenticated: false });
  const [deployments, setDeployments] = useState<DeploymentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const deferredDeployments = useDeferredValue(deployments);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const nextSession = await fetchJson<SessionResponse>(`${apiBaseUrl}/api/v1/session`);
      startTransition(() => {
        setSession(nextSession);
      });

      if (nextSession.authenticated) {
        const payload = await fetchJson<{ deployments: DeploymentView[] }>(`${apiBaseUrl}/api/v1/deployments`);
        startTransition(() => {
          setDeployments(payload.deployments);
        });
      } else {
        startTransition(() => {
          setDeployments([]);
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function submitDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const deployment = await fetchJson<DeploymentView>(`${apiBaseUrl}/api/v1/deployments`, {
        method: "POST",
        body: JSON.stringify({
          telegramBotToken,
          openRouterApiKey,
        }),
      });

      startTransition(() => {
        setDeployments((current) => [deployment, ...current.filter((item) => item.id !== deployment.id)]);
        setTelegramBotToken("");
        setOpenRouterApiKey("");
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  const loginUrl = `${apiBaseUrl}/api/v1/auth/digitalocean/start`;

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <p className="eyebrow">Control plane for OpenClaw on DigitalOcean</p>
        <h1>Deploy the Telegram bot first. Leave the browser UI for later.</h1>
        <p className="lede">
          V1 creates a Droplet, installs OpenClaw, configures Telegram plus OpenRouter, and tracks bootstrap
          progress. OpenClaw browser UI is explicitly out of scope for this release.
        </p>
        <div className="hero-meta">
          <span>Default model: `openrouter/auto`</span>
          <span>Default Droplet: `s-1vcpu-1gb`</span>
          <span>Image: `ubuntu-24-04-x64`</span>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <div className="card-header">
            <h2>1. Authenticate</h2>
            <span>{session.authenticated ? "Connected" : "Required"}</span>
          </div>
          {session.authenticated ? (
            <div className="state-block">
              <p className="state-label">DigitalOcean account linked</p>
              <code>{session.user.email ?? session.user.doUserUuid}</code>
            </div>
          ) : (
            <a className="primary-link" href={loginUrl}>
              Login with DigitalOcean
            </a>
          )}
        </article>

        <article className="card">
          <div className="card-header">
            <h2>2. Launch</h2>
            <span>Telegram + OpenRouter</span>
          </div>
          <form className="deploy-form" onSubmit={submitDeployment}>
            <label>
              <span>Telegram bot token</span>
              <input
                autoComplete="off"
                disabled={!session.authenticated || submitting}
                onChange={(event) => setTelegramBotToken(event.target.value)}
                placeholder="123456:ABCDEF"
                value={telegramBotToken}
              />
            </label>
            <label>
              <span>OpenRouter API key</span>
              <input
                autoComplete="off"
                disabled={!session.authenticated || submitting}
                onChange={(event) => setOpenRouterApiKey(event.target.value)}
                placeholder="sk-or-..."
                value={openRouterApiKey}
              />
            </label>
            <button disabled={!session.authenticated || submitting || !telegramBotToken || !openRouterApiKey} type="submit">
              {submitting ? "Deploying..." : "Deploy OpenClaw"}
            </button>
          </form>
          <p className="muted">
            Launchpad does not expose the OpenClaw browser UI in V1. Success means the Telegram bot is up and the
            Droplet finished bootstrap.
          </p>
        </article>
      </section>

      <section className="card timeline-card">
        <div className="card-header">
          <h2>3. Progress</h2>
          <button className="ghost-button" disabled={loading} onClick={() => void refresh()} type="button">
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error ? <p className="error-callout">{error}</p> : null}

        {deferredDeployments.length === 0 ? (
          <p className="empty-state">No deployments yet.</p>
        ) : (
          <div className="deployment-list">
            {deferredDeployments.map((deployment) => (
              <article className="deployment-card" key={deployment.id}>
                <div className="deployment-summary">
                  <div>
                    <p className="state-label">{deployment.dropletName}</p>
                    <h3>{deployment.status.replaceAll("_", " ")}</h3>
                  </div>
                  <div className="deployment-badges">
                    <span>{deployment.region}</span>
                    <span>{deployment.sizeSlug}</span>
                  </div>
                </div>

                <dl className="facts">
                  <div>
                    <dt>Public IP</dt>
                    <dd>{deployment.publicIpv4 ?? "pending"}</dd>
                  </div>
                  <div>
                    <dt>SSH tunnel</dt>
                    <dd>{deployment.sshTunnelCommand ?? "not available yet"}</dd>
                  </div>
                </dl>

                <div className="event-list">
                  {deployment.events.map((eventItem) => (
                    <div className="event-row" key={eventItem.id}>
                      <span>{eventItem.type}</span>
                      <time>{new Date(eventItem.ts).toLocaleString()}</time>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
