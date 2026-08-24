import { AccountEntry } from "@/features/account/AccountEntry";
import { HomeExperience } from "./HomeExperience";

export default function Home() {
  return (
    <div className="shell">
      <header aria-label="应用顶部栏" className="topbar">
        <AccountEntry />
        <strong className="brand-mark">MuGame</strong>
      </header>

      <HomeExperience />
    </div>
  );
}
