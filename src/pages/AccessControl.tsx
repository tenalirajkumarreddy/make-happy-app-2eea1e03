import { PageHeader } from "@/components/shared/PageHeader";
import { Shield, Users, Store, Route } from "lucide-react";

const AccessControl = () => (
  <div className="space-y-6 animate-fade-in">
    <PageHeader title="Access Control" subtitle="Manage user roles, permissions, and access" />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[
        { title: "User Permissions", desc: "Configure role-based access for sales, transactions, and orders", icon: Shield },
        { title: "User Management", desc: "Enable/disable user accounts and send invitations", icon: Users },
        { title: "Store Type Access", desc: "Control which roles can access which store types", icon: Store },
        { title: "Route Assignment", desc: "Assign routes to agents and configure access", icon: Route },
      ].map((item) => (
        <button key={item.title} className="flex items-start gap-4 rounded-xl border bg-card p-5 text-left hover:shadow-md transition-shadow">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
            <item.icon className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">{item.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
          </div>
        </button>
      ))}
    </div>
  </div>
);

export default AccessControl;
