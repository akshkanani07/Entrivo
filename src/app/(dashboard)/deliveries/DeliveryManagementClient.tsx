"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CameraCapture } from "@/components/visitor/CameraCapture";

type Employee = { id: string; name: string; email: string };
type Delivery = {
  id: string;
  courierCompany: string;
  trackingNumber: string | null;
  packageCount: number;
  description: string | null;
  status: "RECEIVED" | "NOTIFIED" | "COLLECTED" | "RETURNED" | "UNCLAIMED";
  storageLocation: string | null;
  receivedAt: string;
  collectedAt: string | null;
  collectedByName: string | null;
  recipientEmployee: { user: { name: string; email: string } };
};

export function DeliveryManagementClient({
  employees,
  canLog,
  canReadAll,
  canExport,
}: {
  employees: Employee[];
  canLog: boolean;
  canReadAll: boolean;
  canExport: boolean;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipientEmployeeId, setRecipientEmployeeId] = useState("");
  const [courierCompany, setCourierCompany] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [packageCount, setPackageCount] = useState("1");
  const [storageLocation, setStorageLocation] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("ALL");
  const [courierFilter, setCourierFilter] = useState("");
  const [pickupCode, setPickupCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (courierFilter) params.set("courier", courierFilter);
      if (!canReadAll) params.set("own", "true");
      const response = await fetch(`/api/deliveries?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load deliveries.");
      setDeliveries(result.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load deliveries.");
    } finally {
      setLoading(false);
    }
  }, [status, courierFilter, canReadAll]);

  useEffect(() => { void load(); }, [load]);

  async function receiveDelivery() {
    try {
      const response = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmployeeId,
          courierCompany,
          trackingNumber: trackingNumber || undefined,
          packageCount: Number(packageCount),
          storageLocation: storageLocation || undefined,
          photoDataUrl: photoDataUrl || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to receive package.");
      toast.success(`Package received. Pickup code: ${result.pickupCode}`);
      setRecipientEmployeeId("");
      setCourierCompany("");
      setTrackingNumber("");
      setStorageLocation("");
      setPhotoDataUrl(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to receive package.");
    }
  }

  async function collectDelivery(id: string) {
    if (!pickupCode) {
      toast.error("Pickup code is required.");
      return;
    }
    const response = await fetch(`/api/deliveries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "COLLECT", pickupCode }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      toast.error(result.error || "Pickup verification failed.");
      return;
    }
    toast.success("Package collected.");
    setPickupCode("");
    await load();
  }

  async function changeStatus(id: string, action: "RETURN" | "UNCLAIMED") {
    const response = await fetch(`/api/deliveries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) toast.error(result.error || "Unable to update delivery.");
    else await load();
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{canReadAll ? "Deliveries" : "My deliveries"}</h1>
          <p className="text-sm text-slate-500">Courier reception and pickup management</p>
        </div>
        {canExport && (
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            onClick={() => window.location.assign("/api/deliveries/export")}
          >
            Export CSV
          </button>
        )}
      </div>

      {canLog && (
        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="font-bold text-slate-900">Receive package</h2>
            <select className="w-full rounded-lg border p-2 text-sm" value={recipientEmployeeId} onChange={(e) => setRecipientEmployeeId(e.target.value)}>
              <option value="">Select recipient</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.email}</option>)}
            </select>
            <input className="w-full rounded-lg border p-2 text-sm" list="couriers" placeholder="Courier company" value={courierCompany} onChange={(e) => setCourierCompany(e.target.value)} />
            <datalist id="couriers"><option value="DHL" /><option value="FedEx" /><option value="Blue Dart" /><option value="DTDC" /><option value="Amazon" /></datalist>
            <input className="w-full rounded-lg border p-2 text-sm" placeholder="Tracking / AWB" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className="rounded-lg border p-2 text-sm" type="number" min="1" value={packageCount} onChange={(e) => setPackageCount(e.target.value)} />
              <input className="rounded-lg border p-2 text-sm" placeholder="Storage location" value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} />
            </div>
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white" type="button" onClick={receiveDelivery}>Receive & notify</button>
          </div>
          <CameraCapture onCapture={setPhotoDataUrl} onClear={() => setPhotoDataUrl(null)} autoStart={false} />
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap gap-3">
          <select className="rounded-lg border p-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            {["ALL", "RECEIVED", "NOTIFIED", "COLLECTED", "RETURNED", "UNCLAIMED"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <input className="rounded-lg border p-2 text-sm" placeholder="Filter courier" value={courierFilter} onChange={(e) => setCourierFilter(e.target.value)} />
          {canLog && <input className="rounded-lg border p-2 text-sm" placeholder="Pickup code" value={pickupCode} onChange={(e) => setPickupCode(e.target.value)} />}
        </div>
        {loading ? <p className="text-sm text-slate-500">Loading...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="p-2">Recipient</th><th>Courier</th><th>AWB</th><th>Location</th><th>Status</th><th>Received</th><th /></tr></thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-b">
                    <td className="p-2">{delivery.recipientEmployee.user.name}</td>
                    <td>{delivery.courierCompany}</td>
                    <td>{delivery.trackingNumber || "-"}</td>
                    <td>{delivery.storageLocation || "-"}</td>
                    <td>{delivery.status}</td>
                    <td>{new Date(delivery.receivedAt).toLocaleString()}</td>
                    <td className="space-x-2 py-2">
                      {canLog && ["RECEIVED", "NOTIFIED", "UNCLAIMED"].includes(delivery.status) && (
                        <button className="rounded border px-2 py-1" onClick={() => collectDelivery(delivery.id)}>Collect</button>
                      )}
                      {canLog && ["RECEIVED", "NOTIFIED", "UNCLAIMED"].includes(delivery.status) && (
                        <button className="rounded border px-2 py-1" onClick={() => changeStatus(delivery.id, "RETURN")}>Return</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
