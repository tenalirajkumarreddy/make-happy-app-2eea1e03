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
      // Client-side filter for store type targeting and date range
      return (data || []).filter((b: any) => {
        if (b.starts_at && b.starts_at > now) return false;
        if (b.ends_at && b.ends_at < now) return false;
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
              <div className="relative rounded-xl overflow-hidden">
                <img
                  src={b.image_url}
                  alt={b.title}
                  className="w-full h-36 sm:h-48 object-cover"
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
