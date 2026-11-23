"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type OfficeOption = { id: string; label: string };
type Slot = { id: string; code: string; type: string; isActive: boolean; assignments: Array<{ status: string }> };
type Lot = {
  id: string;
  name: string;
  isActive: boolean;
  office: { id: string; name: string };
  slots: Slot[];
};
type Vehicle = {
  id: string;
  plateDisplay: string;
  type: string;
  make: string | null;
  color: string | null;
  visitor: {
    id: string;
    name: string;
    company: string | null;
    checkIns: Array<{ id: string; invitationId: string | null; expectedCheckout: string | null }>;
    invitations: Array<{ id: string; scheduledDate: string; startTime: string; endTime: string; status: string }>;
    invitationVisitors: Array<{ invitation: { id: string; scheduledDate: string; startTime: string; endTime: string; status: string } }>;
  } | null;
};
type Assignment = {
  id: string;
  status: string;
  reservedFrom: string;
  reservedUntil: string;
  slot: { code: string; lot: { name: string } };
  vehicle: { plateDisplay: string; visitor?: { name: string } | null };
  checkIn: { visitor: { name: string }; hostEmployee: { user: { name: string } } } | null;
};
type Permit = {
  id: string;
  validFrom: string;
  validUntil: string;
  vehicle: { plateDisplay: string; type: string; make: string | null; color: string | null };
  visitor: { name: string; company: string | null } | null;
};
type Availability = {
  totals: Array<{ lotId: string; lotName: string; officeName: string; type: string; total: number; available: number; occupied: number; occupancyPercent: number }>;
  occupiedSlots: Array<{ slotId: string; slotCode: string; lotName: string; type: string; plateDisplay: string; visitorName: string | null; hostName: string | null; status: string }>;
};

function localDateTime(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function ParkingManagementClient({
  offices,
  canManage,
  canExport,
}: {
  offices: OfficeOption[];
  canManage: boolean;
  canExport: boolean;
}) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [availability, setAvailability] = useState<Availability>({ totals: [], occupiedSlots: [] });
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lotName, setLotName] = useState("");
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [slotPrefix, setSlotPrefix] = useState("A-");
  const [slotStart, setSlotStart] = useState("1");
  const [slotEnd, setSlotEnd] = useState("20");
  const [slotPadding, setSlotPadding] = useState("2");
  const [slotType, setSlotType] = useState("CAR");
  const [assignmentVehicleId, setAssignmentVehicleId] = useState("");
  const [assignmentTarget, setAssignmentTarget] = useState("");
  const [assignmentSlotId, setAssignmentSlotId] = useState("");
  const [reservationFrom, setReservationFrom] = useState(localDateTime(0));
  const [reservationUntil, setReservationUntil] = useState(localDateTime(2));
  const [gatePlate, setGatePlate] = useState("");
  const [gateType, setGateType] = useState<"ENTRY" | "EXIT">("ENTRY");
  const [gateName, setGateName] = useState("");
  const [foreignPlate, setForeignPlate] = useState(false);
  const [permitVehicleId, setPermitVehicleId] = useState("");
  const [permitFrom, setPermitFrom] = useState(localDateTime(0));
  const [permitUntil, setPermitUntil] = useState(localDateTime(24 * 30));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/parking/lots", { cache: "no-store" }),
        fetch("/api/parking/availability", { cache: "no-store" }),
        fetch("/api/parking/assignments", { cache: "no-store" }),
        fetch("/api/parking/vehicles", { cache: "no-store" }),
        fetch("/api/parking/permits", { cache: "no-store" }),
      ]);
      const results = await Promise.all(responses.map(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Unable to load parking data.");
        return result.data;
      }));
      setLots(results[0]);
      setAvailability(results[1]);
      setAssignments(results[2]);
      setVehicles(results[3]);
      setPermits(results[4]);
      setSelectedLotId((current) => current || results[0][0]?.id || "");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load parking data.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === assignmentVehicleId);
  const vehicleTargets = useMemo(() => {
    const visitor = selectedVehicle?.visitor;
    if (!visitor) return [];
    return [
      ...visitor.checkIns.map((checkIn) => ({
        id: `checkin:${checkIn.id}`,
        label: `${visitor.name} - active check-in`,
      })),
      ...visitor.invitations.map((invitation) => ({
        id: `invitation:${invitation.id}`,
        label: `${visitor.name} - ${invitation.status} invitation`,
      })),
      ...visitor.invitationVisitors.map(({ invitation }) => ({
        id: `invitation:${invitation.id}`,
        label: `${visitor.name} - group ${invitation.status} invitation`,
      })),
    ].filter((target, index, list) => list.findIndex((item) => item.id === target.id) === index);
  }, [selectedVehicle]);

  const occupiedIds = new Set(availability.occupiedSlots.map((slot) => slot.slotId));
  const availableSlots = lots.flatMap((lot) => lot.slots
    .filter((slot) => slot.isActive && lot.isActive && !occupiedIds.has(slot.id))
    .map((slot) => ({ ...slot, lotName: lot.name })));

  async function send(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Parking request failed.");
    return result.data;
  }

  async function createLot(event: React.FormEvent) {
    event.preventDefault();
    try {
      await send("/api/parking/lots", "POST", { name: lotName, officeId });
      setLotName("");
      toast.success("Parking lot created.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Parking lot could not be created.");
    }
  }

  async function createSlots(event: React.FormEvent) {
    event.preventDefault();
    const first = Number(slotStart);
    const last = Number(slotEnd);
    const padding = Number(slotPadding);
    if (!selectedLotId || !Number.isInteger(first) || !Number.isInteger(last) || last < first || last - first >= 250) {
      toast.error("Choose a lot and a valid range of 1-250 slot numbers.");
      return;
    }
    const codes = Array.from({ length: last - first + 1 }, (_, index) =>
      `${slotPrefix}${String(first + index).padStart(Math.max(1, Math.min(4, padding)), "0")}`
    );
    try {
      await send("/api/parking/slots", "POST", { lotId: selectedLotId, codes, type: slotType });
      toast.success(`${codes.length} parking slots created.`);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Parking slots could not be created.");
    }
  }

  async function submitAssignment(event: React.FormEvent) {
    event.preventDefault();
    if (!assignmentVehicleId || !assignmentTarget) {
      toast.error("Select a vehicle and its active visit.");
      return;
    }
    const [targetType, targetId] = assignmentTarget.split(":");
    const body = {
      vehicleId: assignmentVehicleId,
      slotId: assignmentSlotId || undefined,
      checkInId: targetType === "checkin" ? targetId : undefined,
      invitationId: targetType === "invitation" ? targetId : undefined,
      reservedFrom: new Date(reservationFrom).toISOString(),
      reservedUntil: new Date(reservationUntil).toISOString(),
    };
    try {
      const result = await send("/api/parking/assignments", "POST", body);
      toast.success(`Assigned ${result.slot.code} in ${result.slot.lot.name}.`);
      setAssignmentTarget("");
      setAssignmentSlotId("");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Parking assignment failed.");
    }
  }

  async function submitGateEvent(event: React.FormEvent) {
    event.preventDefault();
    try {
      await send("/api/parking/events", "POST", {
        type: gateType,
        plateNumber: gatePlate,
        foreignPlate,
        gate: gateName || undefined,
      });
      toast.success(`Vehicle ${gateType.toLowerCase()} recorded.`);
      setGatePlate("");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Gate event failed.");
    }
  }

  async function submitPermit(event: React.FormEvent) {
    event.preventDefault();
    const vehicle = vehicles.find((item) => item.id === permitVehicleId);
    if (!vehicle) {
      toast.error("Select a vehicle.");
      return;
    }
    try {
      await send("/api/parking/permits", "POST", {
        plateNumber: vehicle.plateDisplay,
        foreignPlate: !/^[A-Z]{2}\s?\d{2}/i.test(vehicle.plateDisplay),
        type: vehicle.type,
        make: vehicle.make ?? undefined,
        color: vehicle.color ?? undefined,
        visitorId: vehicle.visitor?.id,
        validFrom: new Date(permitFrom).toISOString(),
        validUntil: new Date(permitUntil).toISOString(),
      });
      toast.success("Contractor permit created.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Permit could not be created.");
    }
  }

  async function toggleSlot(slot: Slot) {
    try {
      await send(`/api/parking/slots/${slot.id}`, "PATCH", { isActive: !slot.isActive });
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Slot could not be updated.");
    }
  }

  async function toggleLot(lot: Lot) {
    try {
      await send(`/api/parking/lots/${lot.id}`, "PATCH", { isActive: !lot.isActive });
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Lot could not be updated.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Parking & Vehicles</h1>
          <p className="mt-1 text-xs text-slate-400">Manage capacity, visitor assignments, gate entry and exit, and contractor permits.</p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <>
              <a href="/api/parking/report" className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200">Export utilization CSV</a>
              <a href="/api/parking/report?format=excel" className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200">Export XLSX</a>
            </>
          )}
          <button type="button" onClick={() => void load()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">Refresh</button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-300">{error}</p>}
      {loading && <p className="text-xs text-slate-400">Loading parking data...</p>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {availability.totals.map((item) => (
          <div key={`${item.lotId}-${item.type}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs text-slate-400">{item.officeName} / {item.lotName} - {item.type}</p>
            <p className="mt-1 text-xl font-bold text-white">{item.available} <span className="text-sm font-normal text-slate-400">free / {item.total}</span></p>
            <div className="mt-2 h-1.5 rounded bg-slate-800"><div className="h-full rounded bg-indigo-500" style={{ width: `${item.occupancyPercent}%` }} /></div>
            {item.occupancyPercent >= 90 && <p className="mt-2 text-[11px] text-amber-300">Capacity warning: {item.occupancyPercent}% occupied</p>}
          </div>
        ))}
        {!availability.totals.length && !loading && <p className="text-xs text-slate-500">No active parking capacity configured.</p>}
      </section>

      {canManage && (
        <section className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={createLot} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <h2 className="text-sm font-bold text-white">Create parking lot</h2>
            <select required value={officeId} onChange={(event) => setOfficeId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white">
              <option value="">Select office</option>
              {offices.map((office) => <option key={office.id} value={office.id}>{office.label}</option>)}
            </select>
            <input required maxLength={120} value={lotName} onChange={(event) => setLotName(event.target.value)} placeholder="Lot name" className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" />
            <button disabled={!offices.length} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Create lot</button>
          </form>

          <form onSubmit={createSlots} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <h2 className="text-sm font-bold text-white">Bulk-create slots</h2>
            <select required value={selectedLotId} onChange={(event) => setSelectedLotId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white">
              <option value="">Select lot</option>
              {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name} / {lot.office.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input value={slotPrefix} maxLength={20} onChange={(event) => setSlotPrefix(event.target.value)} aria-label="Slot prefix" className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" />
              <select value={slotType} onChange={(event) => setSlotType(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white">
                {["CAR", "BIKE", "EV", "ACCESSIBLE", "RESERVED", "VIP"].map((type) => <option key={type}>{type}</option>)}
              </select>
              <input type="number" min={1} value={slotStart} onChange={(event) => setSlotStart(event.target.value)} aria-label="First slot number" className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" />
              <input type="number" min={1} value={slotEnd} onChange={(event) => setSlotEnd(event.target.value)} aria-label="Last slot number" className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">Number padding
              <input type="number" min={1} max={4} value={slotPadding} onChange={(event) => setSlotPadding(event.target.value)} className="w-16 rounded border border-slate-700 bg-slate-900 p-1 text-white" />
            </label>
            <button disabled={!lots.length} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Create range</button>
          </form>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={submitAssignment} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <h2 className="text-sm font-bold text-white">Assign a visitor parking slot</h2>
          <select required value={assignmentVehicleId} onChange={(event) => { setAssignmentVehicleId(event.target.value); setAssignmentTarget(""); }} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white">
            <option value="">Select vehicle / visitor</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateDisplay} - {vehicle.visitor?.name ?? "Contractor"} ({vehicle.type})</option>)}
          </select>
          <select required value={assignmentTarget} onChange={(event) => setAssignmentTarget(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white">
            <option value="">Select active check-in or invitation</option>
            {vehicleTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
          <select value={assignmentSlotId} onChange={(event) => setAssignmentSlotId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white">
            <option value="">Auto-assign compatible available slot</option>
            {availableSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.lotName} / {slot.code} ({slot.type})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-400">From<input required type="datetime-local" value={reservationFrom} onChange={(event) => setReservationFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" /></label>
            <label className="text-[11px] text-slate-400">Until<input required type="datetime-local" value={reservationUntil} onChange={(event) => setReservationUntil(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" /></label>
          </div>
          <button disabled={!vehicles.length} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Assign / auto-assign</button>
        </form>

        <form onSubmit={submitGateEvent} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <h2 className="text-sm font-bold text-white">Gate entry / exit</h2>
          <div className="flex gap-2">
            {(["ENTRY", "EXIT"] as const).map((type) => (
              <button type="button" key={type} onClick={() => setGateType(type)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${gateType === type ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"}`}>{type}</button>
            ))}
          </div>
          <input required maxLength={24} autoComplete="off" value={gatePlate} onChange={(event) => setGatePlate(event.target.value)} placeholder="Vehicle plate" className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" />
          <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={foreignPlate} onChange={(event) => setForeignPlate(event.target.checked)} />Other or foreign plate</label>
          <input maxLength={80} value={gateName} onChange={(event) => setGateName(event.target.value)} placeholder="Gate (optional)" className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" />
          <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Record {gateType.toLowerCase()}</button>
        </form>
      </section>

      {canManage && (
        <form onSubmit={submitPermit} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 md:grid-cols-4 md:items-end">
          <div className="md:col-span-4"><h2 className="text-sm font-bold text-white">Long-term contractor permit</h2></div>
          <select required value={permitVehicleId} onChange={(event) => setPermitVehicleId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white">
            <option value="">Select registered vehicle</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateDisplay} - {vehicle.visitor?.name ?? "Contractor"}</option>)}
          </select>
          <input required type="datetime-local" value={permitFrom} onChange={(event) => setPermitFrom(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" />
          <input required type="datetime-local" value={permitUntil} onChange={(event) => setPermitUntil(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white" />
          <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Create permit</button>
        </form>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <h2 className="text-sm font-bold text-white">Parking lots and slots</h2>
          {lots.map((lot) => (
            <div key={lot.id} className="rounded-lg border border-slate-800 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white">{lot.name} <span className="text-slate-400">/ {lot.office.name}</span></p>
                {canManage && <button type="button" onClick={() => void toggleLot(lot)} className="text-[11px] text-indigo-300">{lot.isActive ? "Deactivate lot" : "Activate lot"}</button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lot.slots.map((slot) => (
                  <button type="button" key={slot.id} disabled={!canManage} onClick={() => void toggleSlot(slot)} title={slot.isActive ? "Deactivate slot" : "Activate slot"} className={`rounded border px-2 py-1 text-[10px] ${slot.isActive ? "border-slate-700 text-slate-300" : "border-rose-900 text-rose-300"}`}>
                    {slot.code} / {slot.type}{!slot.isActive ? " (off)" : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!lots.length && <p className="text-xs text-slate-500">No lots configured.</p>}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <h2 className="text-sm font-bold text-white">Occupied slots</h2>
          {availability.occupiedSlots.map((slot) => (
            <div key={slot.slotId} className="flex items-center justify-between rounded-lg border border-slate-800 p-3 text-xs">
              <div><p className="font-semibold text-white">{slot.lotName} / {slot.slotCode}</p><p className="text-slate-400">{slot.visitorName ?? "Contractor"} / {slot.hostName ?? "No host"} / {slot.type}</p></div>
              <span className="font-mono text-slate-300">{slot.plateDisplay}</span>
            </div>
          ))}
          {!availability.occupiedSlots.length && <p className="text-xs text-slate-500">No slots are currently occupied.</p>}
          <h3 className="pt-2 text-xs font-semibold text-slate-300">Recent assignments</h3>
          {assignments.slice(0, 8).map((assignment) => (
            <div key={assignment.id} className="flex justify-between rounded-lg border border-slate-800/70 px-3 py-2 text-[11px] text-slate-300">
              <span>{assignment.slot.lot.name} / {assignment.slot.code} - {assignment.vehicle.plateDisplay}</span><span>{assignment.status}</span>
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <h2 className="mb-3 text-sm font-bold text-white">Contractor permits</h2>
          <div className="space-y-2">
            {permits.map((permit) => (
              <div key={permit.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300">
                <span>{permit.vehicle.plateDisplay} - {permit.visitor?.name ?? "Contractor"}</span>
                <span>{new Date(permit.validFrom).toLocaleDateString()} to {new Date(permit.validUntil).toLocaleDateString()}</span>
              </div>
            ))}
            {!permits.length && <p className="text-xs text-slate-500">No active contractor permits.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
