"use client";

import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Building2,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  X,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  Shield,
  Check,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Employee {
  id: string;
  userId: string;
  employeeCode: string;
  designation: string | null;
  phone: string | null;
  status: string;
  autoApproveVisitors: boolean;
  department?: { id: string; name: string } | null;
  office?: { id: string; name: string } | null;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatar: string | null;
    role: string;
  };
  invitations?: any[];
}

interface Department {
  id: string;
  name: string;
}

interface Office {
  id: string;
  name: string;
}

interface Props {
  initialEmployees: Employee[];
  initialDepartments: Department[];
  initialOffices: Office[];
  currentOrgName?: string;
}

export function EmployeesManager({
  initialEmployees,
  initialDepartments,
  initialOffices,
  currentOrgName,
}: Props) {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [offices, setOffices] = useState<Office[]>(initialOffices);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);

  // Loading States
  const [loadingSeed, setLoadingSeed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Premium Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    variant: "danger" | "warning" | "primary";
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    description: "",
    confirmText: "Confirm",
    variant: "primary",
    onConfirm: async () => {},
  });

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    designation: "",
    departmentId: "",
    newDepartmentName: "",
    officeId: "",
    employeeCode: "",
    role: "EMPLOYEE",
    autoApproveVisitors: true,
  });

  const [csvText, setCsvText] = useState(
    "Name,Email,Phone,Designation,Department\nVikrant Singh,vikrant@company.com,+91 98111 22233,Chief Architect,Engineering\nAnanya Sen,ananya@company.com,+91 98111 44455,HR Specialist,Human Resources"
  );

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    if (type === "success") {
      toast.success(text);
    } else {
      toast.error(text);
    }
    setTimeout(() => setMessage(null), 5000);
  };

  // 1-Click Seed Sample Team
  const handleSeedSampleTeam = async () => {
    setLoadingSeed(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_sample" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initialize sample team");

      showNotification("Workplace host team initialized successfully with 4 sample hosts!");
      router.refresh();
      // Re-fetch
      const refreshed = await fetch("/api/employees").then((r) => r.json());
      if (refreshed.data) setEmployees(refreshed.data);
      if (refreshed.departments) setDepartments(refreshed.departments);
      if (refreshed.offices) setOffices(refreshed.offices);
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoadingSeed(false);
    }
  };

  // Create Single Employee
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      showNotification("Please provide employee name and email address", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          departmentName: formData.newDepartmentName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create employee");

      showNotification(`Employee ${formData.name} added! Invitation link dispatched.`);
      setShowAddModal(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        designation: "",
        departmentId: "",
        newDepartmentName: "",
        officeId: "",
        employeeCode: "",
        role: "EMPLOYEE",
        autoApproveVisitors: true,
      });

      router.refresh();
      const refreshed = await fetch("/api/employees").then((r) => r.json());
      if (refreshed.data) setEmployees(refreshed.data);
      if (refreshed.departments) setDepartments(refreshed.departments);
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Update Employee
  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEmp.id,
          designation: editingEmp.designation,
          phone: editingEmp.phone,
          departmentId: editingEmp.department?.id,
          status: editingEmp.status,
          autoApproveVisitors: editingEmp.autoApproveVisitors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update employee");

      showNotification("Employee profile updated successfully");
      setShowEditModal(false);
      router.refresh();
      const refreshed = await fetch("/api/employees").then((r) => r.json());
      if (refreshed.data) setEmployees(refreshed.data);
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Status Quick Toggle
  const handleQuickStatusChange = async (empId: string, newStatus: string) => {
    try {
      const res = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: empId, status: newStatus }),
      });
      if (res.ok) {
        setEmployees((prev) =>
          prev.map((e) => (e.id === empId ? { ...e, status: newStatus } : e))
        );
      }
    } catch (err) {
      console.error("Status update error:", err);
    }
  };

  // Delete Employee with ConfirmDialog
  const handleDeleteEmployee = (id: string, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Remove Workplace Host Employee",
      description: `Are you sure you want to remove ${name} from workplace host employees? Associated invitations and check-in records will remain archived.`,
      confirmText: "Remove Host",
      variant: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/employees?id=${id}`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to delete");

          showNotification(`${name} has been removed.`);
          setEmployees((prev) => prev.filter((e) => e.id !== id));
          router.refresh();
        } catch (err: any) {
          showNotification(err.message, "error");
        }
      },
    });
  };

  // Filter Employees
  const filteredEmployees = employees.filter((emp) => {
    const q = (searchQuery || "").toLowerCase();
    const matchesSearch =
      (emp.user?.name || "").toLowerCase().includes(q) ||
      (emp.user?.email || "").toLowerCase().includes(q) ||
      (emp.employeeCode || "").toLowerCase().includes(q) ||
      (emp.designation ? emp.designation.toLowerCase().includes(q) : false);

    const matchesDept = selectedDept === "ALL" || emp.department?.id === selectedDept;
    const matchesStatus = selectedStatus === "ALL" || emp.status === selectedStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {message && (
        <div
          className={`fixed top-6 right-6 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 border backdrop-blur-xl animate-in slide-in-from-top duration-300 ${
            message.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-200"
              : "bg-rose-950/90 border-rose-500/50 text-rose-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          )}
          <span className="text-xs font-semibold">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-white ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Host Employee Directory
            </h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800">
              {employees.length} Hosts
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Workplace employee hosts eligible to invite visitors, authorize door access, and receive instant arrival alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Seed Button (Especially when 0 or few employees) */}
          <button
            type="button"
            onClick={handleSeedSampleTeam}
            disabled={loadingSeed}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-xs font-semibold transition-all disabled:opacity-50"
          >
            {loadingSeed ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>1-Click Sample Team</span>
          </button>

          {/* Add Employee Modal Button */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Host Employee</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hosts by name, work email, code (EMP-1001), or designation..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Department Filter */}
        <div className="flex items-center gap-2">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Availability</option>
            <option value="AVAILABLE">Available</option>
            <option value="IN_MEETING">In Meeting</option>
            <option value="ON_LEAVE">On Leave</option>
          </select>
        </div>
      </div>

      {/* Empty State Banner (Shown when no employees exist at all) */}
      {employees.length === 0 ? (
        <div className="glass-card rounded-2xl border border-dashed border-indigo-500/30 p-12 text-center max-w-2xl mx-auto space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto shadow-glow-sm">
            <Users className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">No Host Employees Added Yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
              In Entrivo, visitors check in to meet specific employee hosts. Add your workplace team or initialize 4 sample hosts to start testing visitor pre-registrations and badge check-ins right now!
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSeedSampleTeam}
              disabled={loadingSeed}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-glow transition-all"
            >
              {loadingSeed ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>✨ 1-Click Setup: Add 4 Sample Workplace Hosts</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Employee Manually</span>
            </button>
          </div>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="glass-card rounded-2xl border border-slate-800 p-8 text-center text-slate-400 text-xs">
          No host employees match your search filter "{searchQuery}".
        </div>
      ) : (
        /* Employee Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((emp) => {
            const isAvailable = emp.status === "AVAILABLE";
            const isInMeeting = emp.status === "IN_MEETING";

            return (
              <div
                key={emp.id}
                className="glass-card rounded-2xl border border-indigo-950/80 hover:border-indigo-500/40 p-5 space-y-4 transition-all duration-200 group relative flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Card Header: Avatar, Name, Employee Code */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-700 to-indigo-900 text-white border border-indigo-500/30 flex items-center justify-center font-black text-base shadow-sm">
                          {emp.user.name.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#080c14] ${
                            isAvailable
                              ? "bg-emerald-400 shadow-glow-sm"
                              : isInMeeting
                              ? "bg-amber-400"
                              : "bg-slate-500"
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                          {emp.user.name}
                        </h3>
                        <p className="text-xs text-indigo-400 font-medium truncate">
                          {emp.designation || "Workplace Host"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {emp.employeeCode}
                      </span>
                    </div>
                  </div>

                  {/* Host Details */}
                  <div className="space-y-2 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="text-slate-300">{emp.department?.name || "General"}</span>
                      {emp.office && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400 truncate">{emp.office.name}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <a
                        href={`mailto:${emp.user.email}`}
                        className="truncate text-slate-400 hover:text-indigo-300 transition-colors"
                      >
                        {emp.user.email}
                      </a>
                    </div>

                    {emp.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <a
                          href={`tel:${emp.phone}`}
                          className="text-slate-400 hover:text-indigo-300 transition-colors"
                        >
                          {emp.phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Controls & Quick Actions */}
                <div className="pt-3 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    {/* Live Status Selector */}
                    <select
                      value={emp.status}
                      onChange={(e) => handleQuickStatusChange(emp.id, e.target.value)}
                      className={`text-[11px] font-semibold rounded-lg px-2 py-1 border transition-colors cursor-pointer bg-slate-950 ${
                        isAvailable
                          ? "text-emerald-400 border-emerald-500/40"
                          : isInMeeting
                          ? "text-amber-400 border-amber-500/40"
                          : "text-slate-400 border-slate-800"
                      }`}
                    >
                      <option value="AVAILABLE">● Available</option>
                      <option value="IN_MEETING">● In Meeting</option>
                      <option value="ON_LEAVE">● On Leave</option>
                    </select>

                    {emp.autoApproveVisitors ? (
                      <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/70 border border-cyan-800/50 px-2 py-0.5 rounded">
                        Auto-Approve ON
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        Manual Approval
                      </span>
                    )}
                  </div>

                  {/* Actions: Invite Visitor, Edit, Delete */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Link
                      href={`/invitations?hostId=${emp.id}`}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-[11px] font-bold text-center transition-all flex items-center justify-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Invite Visitor</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmp(emp);
                        setShowEditModal(true);
                      }}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
                      title="Edit Employee"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteEmployee(emp.id, emp.user.name)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-800 transition-colors"
                      title="Remove Host"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: ADD EMPLOYEE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Add New Host Employee</h3>
                  <p className="text-xs text-slate-400">Register employee eligible to host visitors</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Vikramaditya Sharma"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Work Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="vikram@company.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Job Title / Designation
                  </label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder="e.g. Senior Product Manager"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98000 00000"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Department Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Department
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={formData.departmentId}
                    onChange={(e) =>
                      setFormData({ ...formData, departmentId: e.target.value, newDepartmentName: "" })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select Existing...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={formData.newDepartmentName}
                    onChange={(e) =>
                      setFormData({ ...formData, newDepartmentName: e.target.value, departmentId: "" })
                    }
                    placeholder="Or type new department"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Employee Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.employeeCode}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    placeholder="Auto-generated if empty"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    System Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="EMPLOYEE">Host Employee</option>
                    <option value="RECEPTIONIST">Receptionist</option>
                    <option value="SECURITY">Security Guard</option>
                    <option value="ORG_ADMIN">Organization Admin</option>
                  </select>
                </div>
              </div>

              {/* Auto-Approve Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white">Auto-Approve Visitor Invitations</h4>
                  <p className="text-[11px] text-slate-400">
                    Immediately approve meeting requests without manual host confirmation
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.autoApproveVisitors}
                  onChange={(e) =>
                    setFormData({ ...formData, autoApproveVisitors: e.target.checked })
                  }
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow transition-all disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Employee</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT EMPLOYEE */}
      {showEditModal && editingEmp && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Edit Host: {editingEmp.user.name}</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Designation</label>
                <input
                  type="text"
                  value={editingEmp.designation || ""}
                  onChange={(e) => setEditingEmp({ ...editingEmp, designation: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editingEmp.phone || ""}
                  onChange={(e) => setEditingEmp({ ...editingEmp, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Department</label>
                <select
                  value={editingEmp.department?.id || ""}
                  onChange={(e) => {
                    const dept = departments.find((d) => d.id === e.target.value);
                    setEditingEmp({
                      ...editingEmp,
                      department: dept || null,
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">No Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Availability Status</label>
                <select
                  value={editingEmp.status}
                  onChange={(e) => setEditingEmp({ ...editingEmp, status: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="AVAILABLE">Available for Visits</option>
                  <option value="IN_MEETING">In Meeting</option>
                  <option value="ON_LEAVE">On Leave</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-semibold text-white">Auto-Approve Visitors</span>
                <input
                  type="checkbox"
                  checked={editingEmp.autoApproveVisitors}
                  onChange={(e) =>
                    setEditingEmp({ ...editingEmp, autoApproveVisitors: e.target.checked })
                  }
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
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

      {/* Reusable Custom Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
      />
    </div>
  );
}
