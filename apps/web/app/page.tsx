import { LaunchpadShell } from "../components/launchpad-shell";

const apiBaseUrl = process.env.NEXT_PUBLIC_LAUNCHPAD_API_URL ?? "http://localhost:3001";

export default function HomePage() {
  return <LaunchpadShell apiBaseUrl={apiBaseUrl} />;
}
