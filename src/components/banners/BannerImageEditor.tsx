import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, Move, RotateCcw } from "lucide-react";

interface CropState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface BannerImageEditorProps {
  imageUrl: string;
  cropData?: CropState | null;
  onCropChange: (crop: CropState) => void;
  /** Display window aspect ratio width/height — default 3 (600x200) */
  aspectRatio?: number;
}

export function BannerImageEditor({
  imageUrl,
  cropData,
  onCropChange,
  aspectRatio = 3,
}: BannerImageEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(cropData?.scale ?? 1);
  const [offsetX, setOffsetX] = useState(cropData?.offsetX ?? 0);
  const [offsetY, setOffsetY] = useState(cropData?.offsetY ?? 0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset when image changes
  useEffect(() => {
    if (cropData) {
      setScale(cropData.scale);
      setOffsetX(cropData.offsetX);
      setOffsetY(cropData.offsetY);
    } else {
      setScale(1);
      setOffsetX(0);
      setOffsetY(0);
    }
  }, [imageUrl]);

  const emitChange = useCallback(
    (s: number, x: number, y: number) => {
      onCropChange({ scale: s, offsetX: x, offsetY: y });
    },
    [onCropChange]
  );

  const handleReset = () => {
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
    emitChange(1, 0, 0);
  };

  const handleScaleChange = (val: number[]) => {
    const newScale = val[0];
    setScale(newScale);
    emitChange(newScale, offsetX, offsetY);
  };

  const handleZoomIn = () => {
    const newScale = Math.min(scale + 0.1, 5);
    setScale(newScale);
    emitChange(newScale, offsetX, offsetY);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(scale - 0.1, 0.1);
    setScale(newScale);
    emitChange(newScale, offsetX, offsetY);
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
    },
    [offsetX, offsetY]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      setOffsetX(newX);
      setOffsetY(newY);
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      emitChange(scale, offsetX, offsetY);
    }
  }, [isDragging, scale, offsetX, offsetY, emitChange]);

  // Touch support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX - offsetX, y: touch.clientY - offsetY });
      }
    },
    [offsetX, offsetY]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const newX = touch.clientX - dragStart.x;
      const newY = touch.clientY - dragStart.y;
      setOffsetX(newX);
      setOffsetY(newY);
    },
    [isDragging, dragStart]
  );

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      emitChange(scale, offsetX, offsetY);
    }
  }, [isDragging, scale, offsetX, offsetY, emitChange]);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.min(Math.max(scale + delta, 0.1), 5);
      setScale(newScale);
      emitChange(newScale, offsetX, offsetY);
    },
    [scale, offsetX, offsetY, emitChange]
  );

  if (!imageUrl) return null;

  return (
    <div className="space-y-3">
      {/* Display Window Preview */}
      <div className="relative">
        <div className="absolute top-2 left-2 z-10 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">
          Display Preview ({aspectRatio === 3 ? "3:1" : `${aspectRatio}:1`})
        </div>
        <div
          ref={containerRef}
          className="relative rounded-xl overflow-hidden border-2 border-primary/20 bg-muted/30 select-none shadow-inner"
          style={{
            aspectRatio: `${aspectRatio}`,
            maxHeight: "300px",
            cursor: isDragging ? "grabbing" : "grab",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Banner preview"
            draggable={false}
            className="absolute select-none pointer-events-none"
            style={{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
              transformOrigin: "center center",
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transition: isDragging ? "none" : "transform 0.1s ease-out",
            }}
          />
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleZoomOut}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Slider
          value={[scale]}
          min={0.1}
          max={5}
          step={0.05}
          onValueChange={handleScaleChange}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleZoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-xs"
          onClick={handleReset}
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      {/* Instructions */}
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Move className="h-3 w-3" />
        Drag to pan, scroll to zoom. This is how the banner will appear to customers.
      </p>
    </div>
  );
}
