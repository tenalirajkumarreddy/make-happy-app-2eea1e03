import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanySettings {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  logoUrl?: string;
  [key: string]: string | undefined;
}

const DEFAULT_SETTINGS: CompanySettings = {
  companyName: "BizManager System",
  address: "",
  phone: "",
  email: "",
  gstin: "",
};

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company_settings"],
    queryFn: async (): Promise<CompanySettings> => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("key, value");

      if (error) {
        console.error("Error fetching company settings:", error);
        return DEFAULT_SETTINGS;
      }

      if (!data || data.length === 0) {
        return DEFAULT_SETTINGS;
      }

      // Convert array of key/value to an object
      const settingsMap = data.reduce((acc, curr) => {
        if (curr.key && curr.value) acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string, string>);

      return {
        companyName: settingsMap.company_name || DEFAULT_SETTINGS.companyName,
        address: settingsMap.business_address || DEFAULT_SETTINGS.address,
        phone: settingsMap.business_phone || DEFAULT_SETTINGS.phone,
        email: settingsMap.business_email || DEFAULT_SETTINGS.email,
        gstin: settingsMap.gstin || DEFAULT_SETTINGS.gstin,
        logoUrl: settingsMap.logo_url,
        ...settingsMap,
      };
    },
    // Settings change rarely, cache for a long time
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}
