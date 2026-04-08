import { LaunchpadShell } from "../components/launchpad-shell";

export const dynamic = "force-dynamic";

const apiBaseUrl = process.env.NEXT_PUBLIC_LAUNCHPAD_API_URL ?? "";

export default function HomePage() {
  return <LaunchpadShell apiBaseUrl={apiBaseUrl} />;
}
