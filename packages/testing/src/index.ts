import { FixedClock, MemoryLaunchpadStore } from "@launchpad/core";
import type {
  CreateDropletCommand,
  CreateDropletResult,
  DigitalOceanAction,
  DigitalOceanClient,
  DigitalOceanDroplet,
  DigitalOceanOAuthClient,
  DigitalOceanTokenSet,
} from "@launchpad/core";

export class FakeDigitalOceanClient implements DigitalOceanClient {
  createDropletCalls: Array<{ accessToken: string; command: CreateDropletCommand }> = [];
  getDropletCalls: Array<{ accessToken: string; dropletId: number }> = [];
  getActionCalls: Array<{ accessToken: string; actionId: number }> = [];

  createDropletResult: CreateDropletResult = {
    dropletId: 1001,
    actionId: 5001,
  };

  droplets = new Map<number, DigitalOceanDroplet>([
    [
      1001,
      {
        id: 1001,
        name: "openclaw-test",
        networksV4: [{ ipAddress: "203.0.113.10", type: "public" }],
      },
    ],
  ]);

  actions = new Map<number, DigitalOceanAction>([[5001, { id: 5001, status: "in-progress" }]]);

  async createDroplet(accessToken: string, command: CreateDropletCommand): Promise<CreateDropletResult> {
    this.createDropletCalls.push({ accessToken, command });
    return structuredClone(this.createDropletResult);
  }

  async getDroplet(accessToken: string, dropletId: number): Promise<DigitalOceanDroplet> {
    this.getDropletCalls.push({ accessToken, dropletId });
    const droplet = this.droplets.get(dropletId);
    if (!droplet) {
      throw new Error(`Unknown droplet ${dropletId}`);
    }
    return structuredClone(droplet);
  }

  async getAction(accessToken: string, actionId: number): Promise<DigitalOceanAction> {
    this.getActionCalls.push({ accessToken, actionId });
    const action = this.actions.get(actionId);
    if (!action) {
      throw new Error(`Unknown action ${actionId}`);
    }
    return structuredClone(action);
  }
}

export class FakeDigitalOceanOAuthClient implements DigitalOceanOAuthClient {
  readonly exchangedCodes = new Map<string, DigitalOceanTokenSet>();
  readonly revokedTokens: string[] = [];

  createAuthorizeUrl(params: { state: string; redirectUri: string; scopes: string[] }): string {
    const url = new URL("https://cloud.digitalocean.com/v1/oauth/authorize");
    url.searchParams.set("client_id", "fake-client-id");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("state", params.state);
    url.searchParams.set("scope", params.scopes.join(" "));
    return url.toString();
  }

  async exchangeCode(params: { code: string; redirectUri: string }): Promise<DigitalOceanTokenSet> {
    const tokenSet = this.exchangedCodes.get(params.code);
    if (!tokenSet) {
      throw new Error(`Unknown code ${params.code} for redirect ${params.redirectUri}`);
    }
    return structuredClone(tokenSet);
  }

  async revokeToken(token: string): Promise<void> {
    this.revokedTokens.push(token);
  }
}

export function createTestClock(iso = "2026-04-08T00:00:00.000Z") {
  return new FixedClock(new Date(iso));
}

export function createTestStore() {
  return new MemoryLaunchpadStore();
}
