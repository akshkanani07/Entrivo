"use client";

import React, { useState } from "react";
import {
  Video,
  Users,
  MapPin,
  CheckCircle2,
  Clock,
  Calendar,
  Sparkles,
  Plus,
  Search,
  Filter,
  X,
  Edit2,
  Trash2,
  Loader2,
  Tv,
  Wifi,
  DoorOpen,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface RoomInvitation {
  id: string;
  startTime: string;
  endTime: string;
  purpose: string;
  visitor: { name: string; company?: string | null };
  hostEmployee: { user: { name: string } };
}

interface MeetingRoom {
  id: string;
  name: string;
  capacity: number;
  floor: string | null;
  amenities: string | null;
  isAvailable: boolean;
  office?: { name: string } | null;
  invitations: RoomInvitation[];
}

interface Office {
  id: string;
  name: string;
}

interface Props {
  initialRooms: MeetingRoom[];
  offices: Office[];
}

export function MeetingRoomsManager({ initialRooms, offices }: Props) {
  const router = useRouter();
  const [rooms, setRooms] = useState<MeetingRoom[]>(initialRooms);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "AVAILABLE" | "OCCUPIED">("ALL");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<MeetingRoom | null>(null);

  // Loading States
  const [seeding, setSeeding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: "",
    capacity: 8,
    floor: "Floor 2",
    officeId: offices[0]?.id || "",
    amenities: "4K Display, Video Conference Bar, Whiteboard, High-Speed WiFi",
    isAvailable: true,
  });

  // Confirm Delete Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    roomId: string;
    roomName: string;
    loading: boolean;
  }>({
    isOpen: false,
    roomId: "",
    roomName: "",
    loading: false,
  });

  const handleSeedRooms = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/meeting-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_sample" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initialize rooms");

      toast.success("4 Executive Meeting Rooms initialized successfully!");
      router.refresh();
      const refreshed = await fetch("/api/meeting-rooms").then((r) => r.json());
      if (refreshed.data) setRooms(refreshed.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to initialize meeting rooms");
    } finally {
      setSeeding(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Please enter a room name");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/meeting-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create meeting room");

      toast.success(`Meeting Room "${form.name}" created!`);
      setShowAddModal(false);
      setForm({
        name: "",
        capacity: 8,
        floor: "Floor 2",
        officeId: offices[0]?.id || "",
        amenities: "4K Display, Video Conference Bar, Whiteboard, High-Speed WiFi",
        isAvailable: true,
      });

      router.refresh();
      const refreshed = await fetch("/api/meeting-rooms").then((r) => r.json());
      if (refreshed.data) setRooms(refreshed.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/meeting-rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRoom.id,
          name: editingRoom.name,
          capacity: editingRoom.capacity,
          floor: editingRoom.floor,
          amenities: editingRoom.amenities,
          isAvailable: editingRoom.isAvailable,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update meeting room");

      toast.success(`Room "${editingRoom.name}" updated!`);
      setShowEditModal(false);
      router.refresh();
      const refreshed = await fetch("/api/meeting-rooms").then((r) => r.json());
      if (refreshed.data) setRooms(refreshed.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to update room");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRoomAvailability = async (room: MeetingRoom) => {
    const newStatus = !room.isAvailable;
    try {
      const res = await fetch("/api/meeting-rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: room.id, isAvailable: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");

      setRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, isAvailable: newStatus } : r))
      );
      toast.info(`Room ${room.name} marked as ${newStatus ? "Available" : "Occupied"}`);
    } catch (err: any) {
      toast.error("Failed to toggle room status");
    }
  };

  const confirmDeleteRoom = async () => {
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/meeting-rooms?id=${deleteDialog.roomId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete room");
      }

      setRooms((prev) => prev.filter((r) => r.id !== deleteDialog.roomId));
      toast.success(`Meeting Room "${deleteDialog.roomName}" deleted.`);
      setDeleteDialog({ isOpen: false, roomId: "", roomName: "", loading: false });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete room");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const filtered = rooms.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      r.name.toLowerCase().includes(q) ||
      (r.floor && r.floor.toLowerCase().includes(q)) ||
      (r.amenities && r.amenities.toLowerCase().includes(q));

    const matchStatus =
      statusFilter === "ALL" ||
      (statusFilter === "AVAILABLE" && r.isAvailable) ||
      (statusFilter === "OCCUPIED" && !r.isAvailable);

    return matchSearch && matchStatus;
  });

  const availableCount = rooms.filter((r) => r.isAvailable).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Meeting Room Management
            </h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800">
              {rooms.length} Rooms
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
              {availableCount} Available
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Workplace conference rooms, boardrooms, capacity allocation, and visitor linked meetings.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSeedRooms}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all disabled:opacity-50"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
            <span>1-Click Sample Rooms</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Meeting Room</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meeting rooms by name, floor, or amenities..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Status</option>
            <option value="AVAILABLE">Available Only</option>
            <option value="OCCUPIED">Occupied Only</option>
          </select>
        </div>
      </div>

      {/* Rooms Grid or Empty State */}
      {rooms.length === 0 ? (
        <div className="glass-card rounded-2xl border border-dashed border-indigo-500/30 p-12 text-center max-w-2xl mx-auto space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto shadow-glow-sm">
            <Video className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">No Meeting Rooms Configured Yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
              Define campus boardrooms and conference spaces to assign to visitor appointments, or click below to populate 4 executive sample rooms with 1 click.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSeedRooms}
              disabled={seeding}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-glow transition-all"
            >
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>✨ 1-Click Setup: Add 4 Executive Meeting Rooms</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Room Manually</span>
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl border border-slate-800 p-8 text-center text-slate-400 text-xs">
          No meeting rooms match your filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((room) => (
            <div
              key={room.id}
              className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 hover:border-indigo-500/40 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                      {room.name}
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-500 flex-shrink-0" />
                      <span>{room.office?.name || "Main Campus"}</span>
                      {room.floor && <span className="text-slate-500">• {room.floor}</span>}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex-shrink-0 ml-2 ${
                      room.isAvailable
                        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-950/80 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {room.isAvailable ? "● AVAILABLE" : "● OCCUPIED"}
                  </span>
                </div>

                {/* Capacity & Amenities Strip */}
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    Capacity: <strong className="text-white">{room.capacity}</strong> seats
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-indigo-400" />
                    Video Bar Ready
                  </span>
                </div>

                <div className="mt-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-400">
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase mb-0.5">
                    Amenities:
                  </span>
                  <p className="line-clamp-2">{room.amenities || "4K Display, HDMI, Acoustic Paneling"}</p>
                </div>
              </div>

              {/* Bottom Section: Bookings & Controls */}
              <div className="border-t border-slate-800/80 pt-3 space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Today's Visitor Bookings ({room.invitations.length}):
                  </span>
                  {room.invitations.length === 0 ? (
                    <span className="text-[11px] text-slate-500 italic block">No bookings scheduled today.</span>
                  ) : (
                    room.invitations.map((inv) => (
                      <div key={inv.id} className="text-xs flex justify-between items-center text-slate-300 py-0.5">
                        <span className="truncate max-w-[150px] font-semibold text-slate-200">
                          {inv.visitor.name}
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                          {inv.startTime} - {inv.endTime}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Card Controls */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={() => toggleRoomAvailability(room)}
                    className={`flex-1 py-1 px-2.5 rounded-lg text-xs font-semibold transition-colors border ${
                      room.isAvailable
                        ? "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800"
                        : "bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-800/50"
                    }`}
                  >
                    {room.isAvailable ? "Set Occupied" : "Mark Free"}
                  </button>

                  <Link
                    href={`/invitations?meetingRoomId=${room.id}`}
                    className="py-1 px-2.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition-all"
                  >
                    Book Room
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingRoom(room);
                      setShowEditModal(true);
                    }}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
                    title="Edit Room"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDeleteDialog({
                        isOpen: true,
                        roomId: room.id,
                        roomName: room.name,
                        loading: false,
                      })
                    }
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-800 transition-colors"
                    title="Delete Room"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ADD ROOM MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-400" />
                Add New Meeting Room
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Room Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Executive Boardroom Alpha"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Seating Capacity</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Floor / Wing</label>
                  <input
                    type="text"
                    value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: e.target.value })}
                    placeholder="Floor 4 - Executive Deck"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Office / Campus</label>
                <select
                  value={form.officeId}
                  onChange={(e) => setForm({ ...form, officeId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Amenities</label>
                <input
                  type="text"
                  value={form.amenities}
                  onChange={(e) => setForm({ ...form, amenities: e.target.value })}
                  placeholder="4K Display, Zoom Rooms Bar, Whiteboard, WiFi"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Meeting Room</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ROOM MODAL */}
      {showEditModal && editingRoom && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Edit Room: {editingRoom.name}</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateRoom} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Room Name</label>
                <input
                  type="text"
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Capacity</label>
                  <input
                    type="number"
                    value={editingRoom.capacity}
                    onChange={(e) => setEditingRoom({ ...editingRoom, capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Floor</label>
                  <input
                    type="text"
                    value={editingRoom.floor || ""}
                    onChange={(e) => setEditingRoom({ ...editingRoom, floor: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Amenities</label>
                <input
                  type="text"
                  value={editingRoom.amenities || ""}
                  onChange={(e) => setEditingRoom({ ...editingRoom, amenities: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-glow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, roomId: "", roomName: "", loading: false })}
        onConfirm={confirmDeleteRoom}
        title="Delete Meeting Room?"
        description={`Are you sure you want to delete "${deleteDialog.roomName}"? Any future appointments linked to this room will have their room assignment unlinked.`}
        confirmLabel="Delete Room"
        variant="danger"
        isLoading={deleteDialog.loading}
      />
    </div>
  );
}
