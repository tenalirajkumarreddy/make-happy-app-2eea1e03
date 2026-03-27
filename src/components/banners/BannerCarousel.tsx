import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

interface BannerCarouselProps {
  storeTypeIds?: string[];
}

export function BannerCarousel({ storeTypeIds }: BannerCarouselProps) {
  const { data: banners } = useQuery({
    queryKey: ["banners-carousel", storeTypeIds],
    queryFn: async () => {
      const now = new Date().toISOString();
      let q = supabase
        .from("promotional_banners")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      const { data } = await q;

      // Load banner_store_types associations
      const bannerIds = (data || []).map((b: any) => b.id);
      let associations: any[] = [];
      if (bannerIds.length > 0) {
        const { data: assocData } = await supabase
          .from("banner_store_types" as any)
          .select("banner_id, store_type_id")
          .in("banner_id", bannerIds);
        associations = assocData || [];
      }

      // Client-side filter for store type targeting and date range
      return (data || []).filter((b: any) => {
        if (b.starts_at && b.starts_at > now) return false;
        if (b.ends_at && b.ends_at < now) return false;

        // Check multi-store type associations first
        const bannerStoreTypeIds = associations
          .filter((a: any) => a.banner_id === b.id)
          .map((a: any) => a.store_type_id);

        if (bannerStoreTypeIds.length > 0) {
          // Banner targets specific store types
          if (!storeTypeIds || storeTypeIds.length === 0) return true;
          return bannerStoreTypeIds.some((stId: string) => storeTypeIds.includes(stId));
        }

        // Fallback to legacy single store_type_id
        if (!b.store_type_id) return true; // null = all types
        if (storeTypeIds && storeTypeIds.includes(b.store_type_id)) return true;
        if (!storeTypeIds || storeTypeIds.length === 0) return true;
        return false;
      });
    },
  });

  if (!banners || banners.length === 0) return null;

  return (
    <Carousel opts={{ loop: true }} className="w-full">
      <CarouselContent>
        {banners.map((b: any) => (
          <CarouselItem key={b.id}>
            <a
              href={b.link_url || undefined}
              target={b.link_url ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="block"
            >
              <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "3" }}>
                <img
                  src={b.image_url}
                  alt={b.title}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    objectFit: "cover",
                    transform: b.crop_data
                      ? `translate(${b.crop_data.offsetX}px, ${b.crop_data.offsetY}px) scale(${b.crop_data.scale})`
                      : undefined,
                    transformOrigin: "center center",
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className="text-sm sm:text-base font-semibold text-white">{b.title}</h3>
                  {b.description && (
                    <p className="text-xs text-white/80 mt-0.5 line-clamp-1">{b.description}</p>
                  )}
                </div>
              </div>
            </a>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
