import { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/mobile-overrides.css";

interface Props {
  children: ReactNode;
  /** Optional title override – usually comes from the menu item label */
  title?: string;
  /** Show a back button when navigating to a detail page */
  showBack?: boolean;
}

/**
 * Wraps web page components with mobile-optimized styling.
 * - Applies the mobile-overrides.css class scope
 * - Adds a back-navigation breadcrumb for detail pages
 * - Handles safe-area spacing
 */
export function MobilePageWrapper({ children, showBack }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-detect detail pages (paths like /customers/:id, /stores/:id, etc.)
  const isDetailPage =
    showBack ??
    /\/(customers|stores|routes|vendors|invoices|staff|hr\/payrolls)\/[^/]+/.test(
      location.pathname
    );

  return (
    <div className="mobile-page-wrapper">
      {isDetailPage && (
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 mb-3 text-sm font-medium text-blue-600 dark:text-blue-400 active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
      )}
      {children}
    </div>
  );
}
