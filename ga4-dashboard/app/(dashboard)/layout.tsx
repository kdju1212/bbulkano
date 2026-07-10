import { DashboardSubnav } from "@/components/dashboard-subnav";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <DashboardSubnav />
      {children}
    </div>
  );
}
