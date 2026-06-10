import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
  };
}

export function AdminPageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="bg-white/50 dark:bg-slate-900/10 px-4 pt-4 pb-5 border-b border-slate-150 dark:border-slate-800/50">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 dark:text-white text-lg font-extrabold tracking-tight">{title}</h2>
          {subtitle && <p className="text-slate-400 dark:text-slate-500 text-xs font-medium mt-0.5">{subtitle}</p>}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/10 dark:shadow-none active:scale-95 transition-all duration-200"
          >
            {action.icon}
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
