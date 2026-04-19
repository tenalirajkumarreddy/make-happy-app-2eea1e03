import { useState } from "react";
import { Loader2, MapPin, Camera, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestLocationPermission, requestCameraPermission } from "@/lib/capacitorUtils";
import { requestNotificationPermission } from "@/hooks/useNotifications";

interface Props {
  onComplete: () => void;
}

const PERMISSIONS = [
  {
    icon: MapPin,
    title: "Location Access",
    description:
      "Required to verify you're at the store when recording sales, find nearby stores, and enable turn-by-turn navigation.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    request: requestLocationPermission,
  },
  {
    icon: Camera,
    title: "Camera Access",
    description:
      "Used to scan QR codes at stores, capture store photos for KYC, and upload receipts.",
    color: "text-green-500",
    bg: "bg-green-500/10",
    borderColor: "border-green-500/30",
    request: requestCameraPermission,
  },
  {
    icon: Bell,
    title: "Push Notifications",
    description:
      "Stay updated with new orders assigned to you, payment confirmations, and important alerts from managers.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    request: requestNotificationPermission,
  },
];

export function PermissionSetup({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const current = PERMISSIONS[step];
  const Icon = current.icon;

  const advance = () => {
    if (step < PERMISSIONS.length - 1) {
      setStep((s) => s + 1);
    } else {
      localStorage.setItem("mobile_permissions_done", "1");
      onComplete();
    }
  };

  const handleAllow = async () => {
    setLoading(true);
    try {
      await current.request();
    } catch {
      void 0;
    }
    setLoading(false);
    advance();
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground px-6 pt-16 pb-10">
      {/* Progress dots */}
      <div className="flex gap-2 justify-center mb-16">
        {PERMISSIONS.map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === step ? "w-8 bg-primary" : i < step ? "w-2 bg-primary/50" : "w-2 bg-muted"
            }`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
        <div className={`rounded-full p-6 border-2 ${current.bg} ${current.borderColor}`}>
          <Icon className={`h-12 w-12 ${current.color}`} />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-3">{current.title}</h1>
          <p className="text-muted-foreground text-base leading-relaxed max-w-sm mx-auto">
            {current.description}
          </p>
        </div>
      </div>

      <div className="space-y-3 mt-8">
        <Button
          className="w-full h-14 text-base font-semibold rounded-2xl"
          onClick={handleAllow}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Allow Access"}
        </Button>
        <Button
          variant="ghost"
          className="w-full h-12 text-sm text-muted-foreground"
          onClick={advance}
          disabled={loading}
        >
          {step < PERMISSIONS.length - 1 ? "Skip for now" : "Done"}
        </Button>
      </div>
    </div>
  );
}
