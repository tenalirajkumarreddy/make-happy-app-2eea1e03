import { useState } from "react";
// import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useRouteAccess } from "@/hooks/useRouteAccess";
import {
  addToQueue,
  queueFileUpload,
  fileToArrayBuffer,
} from "@/lib/offlineQueue";
import { getCurrentPosition, takePhoto } from "@/lib/capacitorUtils";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  MapPin,
  Store,
  User,
  UserPlus,
  Camera,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Step = "type" | "customer" | "store" | "review";
type Mode = "customer" | "store" | "both";

export default function AddCustomerStore({ onClose }: { onClose: () => void }) {
  const { user, role } = useAuth();
  const { canAccessRoute, hasMatrixRestrictions, enabledRouteIds } =
    useRouteAccess(user?.id, role);
  const { isOnline } = useOnlineStatus();
  // const qc = useQueryClient();

  const [step, setStep] = useState<Step>("type");
  const [mode, setMode] = useState<Mode>("both");
  const [saving, setSaving] = useState(false);

  // Customer Data
  const [custId, setCustId] = useState(""); // For "store" mode (selecting existing)
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custEmail, setCustEmail] = useState("");
  // const [custPhoto, setCustPhoto] = useState("");
  const [custPhoto, setCustPhoto] = useState("");
  const [storePhoto, setStorePhoto] = useState("");
  // Track pending offline photos (stored as data URLs until sync)
  const [pendingCustPhoto, setPendingCustPhoto] = useState<string | null>(null);
  const [pendingStorePhoto, setPendingStorePhoto] = useState<string | null>(
    null,
  );

  const handleTakePhoto = async (target: "customer" | "store") => {
    const dataUrl = await takePhoto();
    if (!dataUrl) return;

    const ext = "jpg";
    const path = `${target}s/${crypto.randomUUID()}.${ext}`; // customers/uuid.jpg or stores/uuid.jpg

    // If offline, queue for later upload
    if (!isOnline) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const fileData = await fileToArrayBuffer(blob);

        await queueFileUpload({
          id: `entity-photo-${target}-${Date.now()}`,
          type: target === "customer" ? "entity_photo" : "store_photo",
          fileName: `${target}_${Date.now()}.jpg`,
          bucket: "entity-photos",
          path,
          fileData,
          contentType: "image/jpeg",
          metadata: { target },
        });

        // Store locally to show preview (data URL)
        if (target === "customer") {
          setPendingCustPhoto(dataUrl);
          setCustPhoto(path); // Store path for later reference
        } else {
          setPendingStorePhoto(dataUrl);
          setStorePhoto(path);
        }

        toast.success("Photo saved for upload when online", {
          icon: <WifiOff className="h-4 w-4" />,
        });
      } catch (err: any) {
        toast.error("Failed to queue photo: " + err.message);
      }
      return;
    }

    // Online: Upload to Supabase immediately
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();

      const { error } = await supabase.storage
        .from("entity-photos")
        .upload(path, blob);
      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("entity-photos").getPublicUrl(path);

      if (target === "customer") {
        setCustPhoto(publicUrl);
        setPendingCustPhoto(null);
      } else {
        setStorePhoto(publicUrl);
        setPendingStorePhoto(null);
      }

      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error("Photo upload failed: " + err.message);
    }
  };

  // Store Data
  const [storeName, setStoreName] = useState("");
  // const [storePhone, setStorePhone] = useState("");
  const storePhone = ""; // Use cust phone by default or add input later
  const [storeTypeId, setStoreTypeId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  // Fetch meta data
  const { data: storeTypes } = useQuery({
    queryKey: ["store-types", user?.id, hasMatrixRestrictions],
    queryFn: async () => {
      const q = supabase.from("store_types").select("*").eq("is_active", true);
      const { data } = await q;
      const types = data || [];

      if (hasMatrixRestrictions && enabledRouteIds.size > 0) {
        // If restricted, only show types that exist on allowed routes?
        // Actually, store_types are linked to routes. Routes are linked to store_types.
        // Let's filter available types based on accessible routes if we want strictness.
        // But usually permissions are handled by restricting routes.
        // For now, let's keep all store types unless we want to do heavy filtering.
        // But let's at least filter routes.
      }
      return types;
    },
    enabled: step === "store",
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-list", storeTypeId, user?.id],
    queryFn: async () => {
      let q = supabase.from("routes").select("*").eq("is_active", true);
      if (storeTypeId) q = q.eq("store_type_id", storeTypeId);
      const { data } = await q;
      let fetchedRoutes = data || [];

      // Filter by access
      if (hasMatrixRestrictions) {
        fetchedRoutes = fetchedRoutes.filter((r) => canAccessRoute(r.id));
      }
      return fetchedRoutes;
    },
    enabled: step === "store",
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-list-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, display_id")
        .order("name");
      return data || [];
    },
    enabled: step === "customer" && mode === "store",
  });

  const handleNext = () => {
    if (step === "type") {
      if (mode === "store")
        setStep("customer"); // Select customer
      else setStep("customer"); // Create customer
    } else if (step === "customer") {
      if (mode === "customer") setStep("review");
      else setStep("store");
    } else if (step === "store") {
      setStep("review");
    }
  };

  const captureLocation = async () => {
    setLocating(true);
    const pos = await getCurrentPosition();
    if (pos) {
      setLat(pos.lat);
      setLng(pos.lng);
      // Optional: Reverse geocode could go here, but omitted for speed/simplicity or added later
      toast.success("Location captured");
    } else {
      toast.error("Could not get location");
    }
    setLocating(false);
  };

  const handleSubmit = async () => {
    if (mode !== "customer" && !storeName)
      return toast.error("Store name required");
    if (mode !== "store" && !custName)
      return toast.error("Customer name required");
    if (mode !== "store" && (!custPhone || custPhone.length < 10))
      return toast.error("Valid customer phone required");

    setSaving(true);

    // Duplicate check if online
    if (isOnline && (mode === "store" || mode === "both")) {
      try {
        const warnings: string[] = [];
        const nameTrimmed = storeName.trim();
        if (nameTrimmed) {
          const { data: nameMatches } = await supabase
            .from("stores")
            .select("name")
            .eq("is_active", true)
            .ilike("name", nameTrimmed);
          if (nameMatches && nameMatches.length > 0)
            warnings.push(`A store named "${nameTrimmed}" already exists.`);
        }
        if (lat && lng) {
          const { data: closeStores } = await supabase.rpc(
            "check_store_proximity",
            { p_lat: lat, p_lng: lng, p_radius_m: 50 },
          );
          if (closeStores && closeStores.length > 0)
            warnings.push(
              `There is already a store within 50 meters of this location.`,
            );
        }
        if (warnings.length > 0) {
          const proceed = window.confirm(
            `WARNING:\n\n${warnings.join("\n")}\n\nDo you still want to create this store?`,
          );
          if (!proceed) {
            setSaving(false);
            return;
          }
        }
      } catch (err) {
        console.error("Dupe check failed", err);
      }
    }

    try {
      await processSubmission();

      toast.success("Saved successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const processSubmission = async () => {
    const now = new Date().toISOString();
    let finalCustId = custId;

    // --- CUSTOMER ---
    if (mode === "customer" || mode === "both") {
      const custPayload = {
        name: custName,
        phone: custPhone,
        email: custEmail || null,
        photo_url: custPhoto || null,
        created_at: now,
      };

      if (isOnline) {
        const { data: did } = await supabase.rpc("generate_display_id", {
          prefix: "CUST",
          seq_name: "cust_display_seq",
        });
        const { data: newC, error } = await supabase
          .from("customers")
          .insert({ ...custPayload, display_id: did })
          .select("id")
          .single();
        if (error) throw error;
        finalCustId = newC.id;
      } else {
        finalCustId = crypto.randomUUID();
        await addToQueue({
          id: crypto.randomUUID(),
          type: "customer",
          payload: { customerData: { ...custPayload, id: finalCustId } },
          createdAt: now,
        });
      }
    }

    // --- STORE ---
    if (mode === "store" || mode === "both") {
      if (!finalCustId) throw new Error("No customer linked");

      const storePayload = {
        name: storeName,
        customer_id: finalCustId,
        store_type_id: storeTypeId,
        route_id: routeId || null,
        phone: storePhone || custPhone, // Fallback
        address: address || null,
        lat: lat,
        lng: lng,
        created_at: now,
        is_active: true,
      };

      if (isOnline) {
        const { data: did } = await supabase.rpc("generate_display_id", {
          prefix: "STR",
          seq_name: "str_display_seq",
        });
        const { error } = await supabase
          .from("stores")
          .insert({ ...storePayload, display_id: did });
        if (error) throw error;
      } else {
        await addToQueue({
          id: crypto.randomUUID(),
          type: "store",
          payload: {
            storeData: { ...storePayload, id: crypto.randomUUID() },
            storePricing: [],
          },
          createdAt: now,
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-muted  z-50 flex flex-col pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 bg-background text-foreground border-b border-border">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-card"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">
          {step === "type"
            ? "Add New"
            : step === "review"
              ? "Review"
              : step === "customer"
                ? "Customer Details"
                : "Store Details"}
        </h1>
        <div className="w-9" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        {step === "type" && (
          <div className="grid gap-4">
            <button
              onClick={() => {
                setMode("both");
                setStep("customer");
              }}
              className="p-4 bg-card text-card-foreground rounded-xl border border-border shadow-sm flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
            >
              <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <UserPlus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">
                  New Customer + Store
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Add a new client and their shop location
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto" />
            </button>

            <button
              onClick={() => {
                setMode("store");
                setStep("customer");
              }}
              className="p-4 bg-card text-card-foreground rounded-xl border border-border shadow-sm flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
            >
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Store className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">New Store Only</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  For an existing customer
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto" />
            </button>

            <button
              onClick={() => {
                setMode("customer");
                setStep("customer");
              }}
              className="p-4 bg-card text-card-foreground rounded-xl border border-border shadow-sm flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
            >
              <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                <User className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">New Customer Only</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Register a person without a shop
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto" />
            </button>
          </div>
        )}

        {step === "customer" && (
          <div className="space-y-4">
            {mode === "store" ? (
              <div className="space-y-2">
                <Label>Select Existing Customer</Label>
                <Select onValueChange={setCustId} value={custId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Search customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Enter name"
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    type="tel"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email (Optional)</Label>
                  <Input
                    type="email"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="h-12"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {step === "store" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Store Name</Label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Shop Name"
                className="h-12"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select onValueChange={setStoreTypeId} value={storeTypeId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {storeTypes?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Route</Label>
                <Select onValueChange={setRouteId} value={routeId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {routes?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1"
                  onClick={captureLocation}
                  type="button"
                >
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <MapPin className="h-4 w-4 mr-2 text-blue-600" />
                  )}
                  {lat ? "Update GPS" : "Capture GPS"}
                </Button>
              </div>
              {lat && (
                <p className="text-xs text-green-600 flex items-center mt-1">
                  <Check className="h-3 w-3 mr-1" /> Coordinates captured:{" "}
                  {lat.toFixed(5)}, {lng?.toFixed(5)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Address (Optional)</Label>
              <Textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, landmark..."
              />
            </div>

            <div className="space-y-2">
              <Label>Store Photo</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1"
                  onClick={() => handleTakePhoto("store")}
                  type="button"
                >
                  <Camera className="h-4 w-4 mr-2 text-blue-600" />
                  Upload Photo
                </Button>
              </div>
              {storePhoto && (
                <p className="text-xs text-blue-600 flex items-center mt-1">
                  <Check className="h-3 w-3 mr-1" /> Photo uploaded
                </p>
              )}
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-6">
            <div className="bg-card text-card-foreground rounded-xl p-4 border border-border space-y-3">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">
                Customer
              </h3>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold">
                    {mode === "store"
                      ? customers?.find((c) => c.id === custId)?.name
                      : custName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {mode === "store"
                      ? customers?.find((c) => c.id === custId)?.phone
                      : custPhone}
                  </p>
                </div>
              </div>
            </div>

            {(mode === "store" || mode === "both") && (
              <div className="bg-card text-card-foreground rounded-xl p-4 border border-border space-y-3">
                <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">
                  Store
                </h3>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Store className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold">{storeName}</p>
                    <p className="text-sm text-muted-foreground">
                      {storeTypes?.find((t) => t.id === storeTypeId)?.name ||
                        "No type"}
                    </p>
                  </div>
                </div>
                {lat && lng && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 p-2 rounded-lg">
                    <MapPin className="h-3 w-3" />
                    GPS Location included
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 bg-background text-foreground border-t border-border">
        {step === "review" ? (
          <Button
            className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Confirm & Save"}
          </Button>
        ) : step !== "type" ? (
          <Button className="w-full h-12 text-base" onClick={handleNext}>
            Next Step
          </Button>
        ) : null}
      </div>
    </div>
  );
}
