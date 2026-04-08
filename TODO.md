# TODO

## V1 (approved scope)

- Launchpad deploys OpenClaw to a DigitalOcean Droplet.
- MVP is `minimal version`.
- OpenClaw browser UI is **not** included in V1.
- Success criterion for V1: Droplet is created, OpenClaw starts successfully, and the bot is reachable via Telegram.
- LLM provider for V1: `OpenRouter` only.
- Default model for V1: `openrouter/auto`.

## Post-V1

- Add optional access to the OpenClaw UI.
- Preferred no-SSH direction: `Tailscale Serve`, while keeping the gateway loopback-only.
- Keep `SSH tunnel` as a fallback access mode for advanced users and debugging.
- Replace the temporary dev-only `launchpad` debug user and remove `NOPASSWD:ALL` before production hardening.
- Replace local-machine SSH key injection with proper SSH key selection/attachment from DigitalOcean.
- Add fine-grained install progress from the Droplet: apt, docker install, image pull, container start, healthz ready, and fallback polling when callbacks fail.
- Add a pairing-management fallback in Launchpad UI when Telegram user id was not provided at deploy time.
- Add model selection in Launchpad instead of hardcoding `openrouter/auto`.
- Add support for choosing a specific OpenRouter model per deployment.
- Evaluate whether UI access should stay optional or become part of the default flow.
