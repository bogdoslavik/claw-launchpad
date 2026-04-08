import { createRequire } from "node:module";

import { ExternalServiceError } from "./errors.js";
import type {
  CreateDropletCommand,
  CreateDropletResult,
  DigitalOceanAction,
  DigitalOceanClient,
  DigitalOceanDroplet,
  DigitalOceanOAuthClient,
  DigitalOceanTokenSet,
} from "./types.js";

const require = createRequire(import.meta.url);
const { createDigitalOceanClient, DigitalOceanApiKeyAuthenticationProvider } = require("@digitalocean/dots") as {
  createDigitalOceanClient: (adapter: unknown) => any;
  DigitalOceanApiKeyAuthenticationProvider: new (token: string) => unknown;
};
const { FetchRequestAdapter } = require("@microsoft/kiota-http-fetchlibrary") as {
  FetchRequestAdapter: new (authProvider: unknown) => unknown;
};

interface OAuthClientOptions {
  clientId: string;
  clientSecret: string;
  authorizeBaseUrl?: string;
  tokenUrl?: string;
  revokeUrl?: string;
}

export class DigitalOceanOAuthFetchClient implements DigitalOceanOAuthClient {
  private readonly authorizeBaseUrl: string;
  private readonly tokenUrl: string;
  private readonly revokeUrl: string;

  constructor(private readonly options: OAuthClientOptions) {
    this.authorizeBaseUrl = options.authorizeBaseUrl ?? "https://cloud.digitalocean.com/v1/oauth/authorize";
    this.tokenUrl = options.tokenUrl ?? "https://cloud.digitalocean.com/v1/oauth/token";
    this.revokeUrl = options.revokeUrl ?? "https://cloud.digitalocean.com/v1/oauth/revoke";
  }

  createAuthorizeUrl(params: { state: string; redirectUri: string; scopes: string[] }): string {
    const url = new URL(this.authorizeBaseUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("state", params.state);
    if (params.scopes.length > 0) {
      url.searchParams.set("scope", params.scopes.join(" "));
    }
    return url.toString();
  }

  async exchangeCode(params: { code: string; redirectUri: string }): Promise<DigitalOceanTokenSet> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: params.redirectUri,
    });

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new ExternalServiceError(`DigitalOcean OAuth token exchange failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      info?: {
        uuid?: string;
        team_uuid?: string;
        email?: string;
      };
    };

    if (!payload.access_token || !payload.info?.uuid || !payload.info.team_uuid) {
      throw new ExternalServiceError("DigitalOcean OAuth response was missing required fields");
    }

    const expiresAt = new Date(Date.now() + (payload.expires_in ?? 0) * 1000).toISOString();
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt,
      scope: payload.scope ? payload.scope.split(/\s+/u).filter(Boolean) : [],
      identity: {
        uuid: payload.info.uuid,
        teamUuid: payload.info.team_uuid,
        email: payload.info.email,
      },
    };
  }

  async revokeToken(token: string): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      token,
    });

    const response = await fetch(this.revokeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new ExternalServiceError(`DigitalOcean OAuth revoke failed with ${response.status}`);
    }
  }
}

export class DoTsDigitalOceanClient implements DigitalOceanClient {
  private createClient(accessToken: string) {
    const authProvider = new DigitalOceanApiKeyAuthenticationProvider(accessToken);
    const adapter = new FetchRequestAdapter(authProvider);
    return createDigitalOceanClient(adapter);
  }

  async createDroplet(accessToken: string, command: CreateDropletCommand): Promise<CreateDropletResult> {
    const client = this.createClient(accessToken);
    const response = (await client.v2.droplets.post({
      name: command.name,
      region: command.region,
      size: command.size,
      image: command.image,
      userData: command.userData,
    })) as {
      droplet?: {
        id?: number | null;
      };
      links?: {
        actions?: Array<{ id?: number | null } | null> | null;
      };
    };

    const dropletId = response.droplet?.id ?? undefined;
    const actionId = response.links?.actions?.[0]?.id ?? undefined;

    if (!dropletId) {
      throw new ExternalServiceError("DigitalOcean did not return a droplet id");
    }

    return {
      dropletId,
      actionId: actionId ?? undefined,
    };
  }

  async getDroplet(accessToken: string, dropletId: number): Promise<DigitalOceanDroplet> {
    const client = this.createClient(accessToken);
    const response = (await client.v2.droplets.byDroplet_id(dropletId).get()) as {
      droplet?: {
        id?: number | null;
        name?: string | null;
        networks?: {
          v4?: Array<{ ipAddress?: string | null; type?: "public" | "private" | null } | null> | null;
        } | null;
      };
    };

    const droplet = response.droplet;
    if (!droplet?.id) {
      throw new ExternalServiceError(`Droplet ${dropletId} was not returned by DigitalOcean`);
    }

    return {
      id: droplet.id,
      name: droplet.name ?? undefined,
      networksV4:
        droplet.networks?.v4
          ?.filter((network): network is NonNullable<typeof network> => Boolean(network?.ipAddress && network.type))
          .map((network) => ({
            ipAddress: network.ipAddress!,
            type: network.type as "public" | "private",
          })) ?? [],
    };
  }

  async getAction(accessToken: string, actionId: number): Promise<DigitalOceanAction> {
    const client = this.createClient(accessToken);
    const response = (await client.v2.actions.byAction_id(actionId).get()) as {
      action?: {
        id?: number | null;
        status?: string | null;
      };
    };

    if (!response.action?.id || !response.action.status) {
      throw new ExternalServiceError(`Action ${actionId} was not returned by DigitalOcean`);
    }

    return {
      id: response.action.id,
      status: response.action.status,
    };
  }
}
