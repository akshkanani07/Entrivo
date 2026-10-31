import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import {
  Building2,
  MapPin,
  Clock,
  Shield,
  Layers,
  Users,
  Briefcase,
  Plus,
  CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const user = await requirePagePermission("org.manage");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      branches: {
        include: {
          offices: {
            include: { meetingRooms: true, employees: true },
          },
        },
      },
      departments: {
        include: { employees: true },
      },
      visitorTypes: true,
      settings: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Workplace Organization Setup
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Enterprise structure: Multi-branch campuses, offices, departments, security policies, and working hours.
          </p>
        </div>
      </div>

      {/* Profile & Campus Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Card */}
        <div className="glass-card rounded-2xl border border-indigo-500/30 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-bold text-white text-lg shadow-glow">
              {org?.name.charAt(0) || "E"}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{org?.name}</h2>
              <span className="text-[11px] text-indigo-400 font-mono">slug: {org?.slug}</span>
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Domain:</span>
              <span className="font-semibold text-slate-200">{org?.domain || "entrivo.com"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Location:</span>
              <span className="text-slate-200">{org?.city}, {org?.country}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Working Hours:</span>
              <span className="font-mono text-cyan-400">{org?.workingHours}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Contact:</span>
              <span className="text-slate-200">{org?.contactEmail}</span>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
            <span className="text-slate-500 font-semibold block uppercase text-[10px]">Campus Address:</span>
            <p className="text-slate-300">{org?.address}</p>
          </div>
        </div>

        {/* Departments Breakdown */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-400" />
              Departments ({org?.departments.length || 0})
            </h3>
          </div>

          <div className="space-y-2">
            {org?.departments.map((dept) => (
              <div
                key={dept.id}
                className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-white block">{dept.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{dept.code}</span>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {dept.employees.length} hosts
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Visitor Policies */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            Check-In & Security Policies
          </h3>

          <div className="space-y-2.5 text-xs text-slate-300">
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-white">Government ID Required</strong>
                <p className="text-[11px] text-slate-400">All guests must present ID proof during entry</p>
              </div>
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-white">Digital Pass & Badge Protocol</strong>
                <p className="text-[11px] text-slate-400">Visitors must wear physical or digital badges</p>
              </div>
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-white">Real-Time Host Escort</strong>
                <p className="text-[11px] text-slate-400">Hosts must escort vendors and interviewees</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Branches & Offices Section */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              Campus Branches & Facility Offices
            </h3>
            <p className="text-xs text-slate-400">Configured premises, buildings, floors, and meeting rooms</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {org?.branches.map((b) => (
            <div key={b.id} className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{b.name}</h4>
                  <p className="text-xs text-slate-400">{b.address}</p>
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
                  {b.code}
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-900">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Offices & Floors ({b.offices.length}):
                </span>
                {b.offices.map((off) => (
                  <div key={off.id} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/70 text-xs space-y-1">
                    <div className="flex justify-between font-semibold text-slate-200">
                      <span>{off.name}</span>
                      <span className="text-slate-400 text-[10px]">{off.floor} • {off.building}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Rooms: {off.meetingRooms.map((r) => `${r.name} (${r.capacity} seats)`).join(", ") || "None"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
