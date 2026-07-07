import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INTANGLES_BASE = "https://apis.intangles.com";

interface IntanglesVehicle {
  id: string;
  v_id?: string;
  tag?: string;
  plate?: string;
  status?: string;
  location?: [string, string];
  last_state?: {
    loc?: { lat: string; lng: string };
    sp?: number;
    hd?: number;
    dp?: number;
    exb?: number;
    fix?: number;
  };
  fuel_info?: { amount?: number; percentage?: number; last_update?: number };
  ad_blue?: { lvl?: number; per?: number; t?: number };
  odom?: { vehicle_odo_km?: number; vehicle_odo_km_timestamp?: number };
  engine_info?: { total_engine_hours?: { value?: number; timestamp?: number } };
  connection_status?: { status?: boolean; time?: number; info_string?: string };
  dtcs?: { list?: any[]; t?: number };
  lamps?: { list?: Array<{ code: string; time: number }>; t?: number };
  account_id?: string;
  account_name?: string;
}

interface Thresholds {
  fuel_pct: number;
  adblue_pct: number;
  warehouse_radius_m: number;
  store_radius_m: number;
}

interface Location {
  lat: number;
  lng: number;
}

interface WarehouseInfo {
  id: string;
  latitude: number;
  longitude: number;
}

interface StoreInfo {
  id: string;
  lat: number;
  lng: number;
}

function haversineDistance(a: Location, b: Location): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function parseLocation(loc: any): Location | null {
  if (!loc) return null;
  if (Array.isArray(loc) && loc.length >= 2) {
    const lat = parseFloat(loc[1]);
    const lng = parseFloat(loc[0]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  if (loc.lat && loc.lng) {
    const lat = parseFloat(loc.lat);
    const lng = parseFloat(loc.lng);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  if (loc.latitude && loc.longitude) {
    const lat = parseFloat(loc.latitude);
    const lng = parseFloat(loc.longitude);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  return null;
}

function isWithinGeofence(
  vehicleLoc: Location,
  targetLoc: Location,
  radiusMeters: number
): boolean {
  return haversineDistance(vehicleLoc, targetLoc) <= radiusMeters;
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = Deno.env.get("INTANGLES_TOKEN");
    const client = Deno.env.get("INTANGLES_CLIENT") || "imaxx_app";
    const accountId = Deno.env.get("INTANGLES_ACCOUNT_ID");

    if (!token || !accountId) {
      return new Response(
        JSON.stringify({ error: "Missing INTANGLES_TOKEN or INTANGLES_ACCOUNT_ID" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const headers = {
      accept: "application/json, text/plain, */*",
      "intangles-client": client,
      "intangles-session-type": "web",
      "intangles-user-token": token,
      "intangles-user-tz": "Asia/Calcutta",
    };

    const vehicleListResp = await fetch(
      `${INTANGLES_BASE}/vehicle/getlist?pnum=1&psize=100&lastloc=true&proj=commands&get_account_names=true&only_owner=true&acc_id=${accountId}&lang=en`,
      { headers }
    );

    if (vehicleListResp.status === 401) {
      await supabase.from("notifications").insert({
        type: "intangles_token_expired",
        title: "Intangles Token Expired",
        message:
          "The Intangles API token has expired. Update it in the Edge Function environment variables to resume vehicle tracking.",
        user_id: null,
        is_read: false,
      });
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!vehicleListResp.ok) {
      return new Response(
        JSON.stringify({ error: `Intangles API error: ${vehicleListResp.status}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const vehicleData = await vehicleListResp.json();
    const vehicles: IntanglesVehicle[] = vehicleData.v || [];

    if (vehicles.length === 0) {
      return new Response(JSON.stringify({ success: true, vehiclesProcessed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: integrations } = await supabase
      .from("vehicle_integrations")
      .select("vehicle_id, intangles_v_id")
      .eq("is_tracked", true);

    const integrationMap = new Map<string, string>();
    if (integrations) {
      for (const inv of integrations) {
        if (inv.intangles_v_id) {
          integrationMap.set(inv.intangles_v_id, inv.vehicle_id);
        }
      }
    }

    const { data: thresholdRows } = await supabase
      .from("vehicle_alert_thresholds")
      .select("metric, value");

    const thresholds: Thresholds = {
      fuel_pct: 15,
      adblue_pct: 15,
      warehouse_radius_m: 500,
      store_radius_m: 200,
    };
    if (thresholdRows) {
      for (const row of thresholdRows) {
        if (row.metric === "fuel_pct") thresholds.fuel_pct = row.value;
        else if (row.metric === "adblue_pct") thresholds.adblue_pct = row.value;
        else if (row.metric === "warehouse_radius_m")
          thresholds.warehouse_radius_m = row.value;
        else if (row.metric === "store_radius_m")
          thresholds.store_radius_m = row.value;
      }
    }

    const { data: warehouses } = await supabase
      .from("warehouses")
      .select("id, latitude, longitude")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    const warehouseLocs: WarehouseInfo[] = (warehouses || []).map((w: any) => ({
      id: w.id,
      latitude: parseFloat(w.latitude),
      longitude: parseFloat(w.longitude),
    }));

    const { data: stores } = await supabase
      .from("stores")
      .select("id, lat, lng")
      .not("lat", "is", null)
      .not("lng", "is", null);

    const storeLocs: StoreInfo[] = (stores || []).map((s: any) => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
    }));

    const { data: activeSessions } = await supabase
      .from("vehicle_sessions")
      .select("id, vehicle_id, start_time, start_odometer_km, origin_warehouse_id")
      .eq("status", "active");

    const sessionMap = new Map<string, any>();
    if (activeSessions) {
      for (const s of activeSessions) {
        sessionMap.set(s.vehicle_id, s);
      }
    }

    const now = new Date().toISOString();
    let processedCount = 0;
    let autoCreatedCount = 0;

    for (const v of vehicles) {
      let ourVehicleId = integrationMap.get(v.id);

      if (!ourVehicleId) {
        const plate = v.plate || v.tag || v.id;
        const { data: newVehicle, error: createErr } = await supabase
          .from("vehicles")
          .insert({
            plate_number: plate,
            capacity_kg: 0,
            status: "active",
          })
          .select("id")
          .single();

        if (createErr || !newVehicle) {
          console.error("Failed to auto-create vehicle:", plate, createErr);
          continue;
        }

        await supabase.from("vehicle_integrations").insert({
          vehicle_id: newVehicle.id,
          intangles_v_id: v.id,
          is_tracked: true,
        });

        ourVehicleId = newVehicle.id;
        integrationMap.set(v.id, ourVehicleId);
        autoCreatedCount++;
      }

      processedCount++;

      const loc = parseLocation(v.location || v.last_state?.loc);
      const speed = v.last_state?.sp ?? null;
      const heading = v.last_state?.hd ?? null;
      const fuelAmount = v.fuel_info?.amount ?? null;
      const fuelPct = v.fuel_info?.percentage ?? null;
      const adblueLevel = v.ad_blue?.lvl ?? null;
      const adbluePct = v.ad_blue?.per ?? null;
      const odo = v.odom?.vehicle_odo_km ?? null;
      const engHrs = v.engine_info?.total_engine_hours?.value ?? null;
      const connStatus = v.connection_status?.status ?? null;
      const dtcCount = v.dtcs?.list?.length ?? 0;
      const hasLamps = (v.lamps?.list?.length ?? 0) > 0;

      await supabase.from("vehicle_telemetry").insert({
        vehicle_id: ourVehicleId,
        timestamp: now,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        speed,
        heading,
        fuel_amount: fuelAmount,
        fuel_percentage: fuelPct,
        adblue_level: adblueLevel,
        adblue_percentage: adbluePct,
        odometer_km: odo,
        engine_hours: engHrs,
        status: v.status || null,
        connection_status: connStatus,
        dtc_count: dtcCount,
        has_warning_lamps: hasLamps,
        raw_payload: v,
      });

      const notifications: any[] = [];

      if (fuelPct !== null && fuelPct < thresholds.fuel_pct) {
        const { data: recent } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "fuel_low")
          .eq("entity_id", ourVehicleId)
          .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
          .limit(1);
        if (!recent || recent.length === 0) {
          notifications.push({
            type: "fuel_low",
            title: "Low Fuel",
            message: `Vehicle ${v.tag || v.plate || ourVehicleId} fuel is at ${fuelPct}%.`,
            entity_type: "vehicle",
            entity_id: ourVehicleId,
            is_read: false,
          });
        }
      }

      if (adbluePct !== null && adbluePct < thresholds.adblue_pct) {
        const { data: recent } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "adblue_low")
          .eq("entity_id", ourVehicleId)
          .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
          .limit(1);
        if (!recent || recent.length === 0) {
          notifications.push({
            type: "adblue_low",
            title: "Low AdBlue",
            message: `Vehicle ${v.tag || v.plate || ourVehicleId} AdBlue is at ${adbluePct}%.`,
            entity_type: "vehicle",
            entity_id: ourVehicleId,
            is_read: false,
          });
        }
      }

      let atWarehouse = false;
      let atStore: string | null = null;

      if (loc) {
        for (const wh of warehouseLocs) {
          if (
            isWithinGeofence(
              loc,
              { lat: wh.latitude, lng: wh.longitude },
              thresholds.warehouse_radius_m
            )
          ) {
            atWarehouse = true;
            break;
          }
        }

        if (!atWarehouse) {
          for (const st of storeLocs) {
            if (
              isWithinGeofence(
                loc,
                { lat: st.lat, lng: st.lng },
                thresholds.store_radius_m
              )
            ) {
              atStore = st.id;
              break;
            }
          }
        }
      }

      const status = v.status || "";
      const isParked = status === "PARKED";
      const isStopped = status === "STOPPED" || (speed !== null && speed === 0);

      if (isParked && loc && !atWarehouse && !atStore) {
        const { data: recent } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "parked_unauthorized")
          .eq("entity_id", ourVehicleId)
          .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
          .limit(1);
        if (!recent || recent.length === 0) {
          notifications.push({
            type: "parked_unauthorized",
            title: "Vehicle Parked Outside Authorized Location",
            message: `Vehicle ${v.tag || v.plate || ourVehicleId} is parked outside warehouse and store geofences.`,
            entity_type: "vehicle",
            entity_id: ourVehicleId,
            is_read: false,
          });
        }
      }

      if (isStopped && loc && !atWarehouse && !atStore && !isParked) {
        const { data: recent } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "stopped_unauthorized")
          .eq("entity_id", ourVehicleId)
          .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
          .limit(1);
        if (!recent || recent.length === 0) {
          notifications.push({
            type: "stopped_unauthorized",
            title: "Vehicle Stopped Unexpectedly",
            message: `Vehicle ${v.tag || v.plate || ourVehicleId} stopped at an unauthorized location outside warehouse and store geofences.`,
            entity_type: "vehicle",
            entity_id: ourVehicleId,
            is_read: false,
          });
        }
      }

      if (atStore && isStopped) {
        const { data: recent } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "at_store_delivery")
          .eq("entity_id", ourVehicleId)
          .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
          .limit(1);
        if (!recent || recent.length === 0) {
          notifications.push({
            type: "at_store_delivery",
            title: "Vehicle at Store",
            message: `Vehicle ${v.tag || v.plate || ourVehicleId} is at a store location for delivery.`,
            entity_type: "vehicle",
            entity_id: ourVehicleId,
            is_read: false,
          });
        }
      }

      for (const notif of notifications) {
        await supabase.from("notifications").insert(notif);
      }

      const activeSession = sessionMap.get(ourVehicleId);

      if (activeSession && atWarehouse) {
        const fuelUsed =
          odo !== null && activeSession.start_odometer_km
            ? odo - activeSession.start_odometer_km
            : null;

        let fuelCost: number | null = null;
        if (fuelUsed && fuelUsed > 0) {
          const { data: lastExpense } = await supabase
            .from("expenses")
            .select("amount, quantity_liters")
            .eq("vehicle_id", ourVehicleId)
            .not("quantity_liters", "is", null)
            .gt("quantity_liters", 0)
            .order("created_at", { ascending: false })
            .limit(1);

          if (lastExpense && lastExpense.length > 0) {
            const unitPrice =
              lastExpense[0].amount / lastExpense[0].quantity_liters;
            fuelCost = parseFloat((fuelUsed * unitPrice).toFixed(2));
          }
        }

        await supabase
          .from("vehicle_sessions")
          .update({
            end_time: now,
            end_odometer_km: odo,
            total_distance_km: fuelUsed,
            fuel_used_liters: fuelUsed,
            fuel_cost: fuelCost,
            status: "completed",
          })
          .eq("id", activeSession.id);

        sessionMap.delete(ourVehicleId);
      } else if (!activeSession && !atWarehouse && loc) {
        const { data: newSession } = await supabase
          .from("vehicle_sessions")
          .insert({
            vehicle_id: ourVehicleId,
            start_time: now,
            start_odometer_km: odo,
            origin_warehouse_id: warehouseLocs.length > 0 ? warehouseLocs[0].id : null,
            status: "active",
          })
          .select("id")
          .single();

        if (newSession) {
          sessionMap.set(ourVehicleId, {
            id: newSession.id,
            vehicle_id: ourVehicleId,
            start_time: now,
            start_odometer_km: odo,
          });
        }
      }

      if (activeSession && atStore && isStopped) {
        const { data: existingStop } = await supabase
          .from("vehicle_session_stops")
          .select("id")
          .eq("session_id", activeSession.id)
          .eq("store_id", atStore)
          .is("departure_time", null)
          .limit(1);

        if (!existingStop || existingStop.length === 0) {
          await supabase.from("vehicle_session_stops").insert({
            session_id: activeSession.id,
            store_id: atStore,
            arrival_time: now,
            odometer_km: odo,
            lat: loc?.lat ?? null,
            lng: loc?.lng ?? null,
            stop_type: "store",
          });
        }
      }

      if (activeSession && atStore && !isStopped) {
        await supabase
          .from("vehicle_session_stops")
          .update({ departure_time: now })
          .eq("session_id", activeSession.id)
          .eq("store_id", atStore)
          .is("departure_time", null);
      }

      if (activeSession && atWarehouse && isStopped) {
        await supabase
          .from("vehicle_session_stops")
          .update({ departure_time: now })
          .eq("session_id", activeSession.id)
          .is("store_id", null)
          .is("departure_time", null)
          .eq("stop_type", "warehouse");
      }
    }

    const statesResp = await fetch(
      `${INTANGLES_BASE}/vehicle/getstatescount?lastloc=true&__read_from_secondary=true&connection_states=true&vehicle_states=stopped,&acc_id=${accountId}&lang=en`,
      { headers }
    );

    if (statesResp.ok) {
      const statesData = await statesResp.json();
      const s = statesData.states || {};
      const c = statesData.connection_status || {};

      await supabase.from("vehicle_fleet_summary").insert({
        moving: s.moving ?? 0,
        parked: s.parked ?? 0,
        idling: s.idling ?? 0,
        stopped: s.stopped ?? 0,
        out_of_network: s.out_of_network ?? 0,
        sleeping: s.sleeping ?? 0,
        charging: s.charging ?? 0,
        connected: c.connected ?? 0,
        disconnected: c.disconnected ?? 0,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        vehiclesProcessed: processedCount,
        vehiclesInResponse: vehicles.length,
        autoCreated: autoCreatedCount,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Poll error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
