import React from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { FiUser, FiShield, FiMail, FiMapPin, FiClock, FiEdit3, FiKey, FiCpu } from "react-icons/fi";

const ProfileStat = ({ label, value, icon: Icon }) => (
  <div className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
      <Icon size={20} />
    </div>
    <div>
      <div className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
      <div className="text-sm font-bold text-white mt-0.5">{value}</div>
    </div>
  </div>
);

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Analyst Profile</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your identity and security credentials.</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <FiEdit3 /> Edit Profile
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Identity Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="soc-card p-10 flex flex-col items-center text-center">
            <div className="relative">
              <div className="h-32 w-32 rounded-3xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-primary text-5xl font-black shadow-2xl shadow-primary/10">
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-success rounded-full border-4 border-[#0f172a] flex items-center justify-center" title="Active">
                <div className="h-2 w-2 bg-white rounded-full animate-pulse" />
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">{user?.username}</h2>
              <p className="text-primary font-bold text-xs uppercase tracking-[0.2em] mt-2">{user?.role} // LEVEL_4</p>
            </div>

            <div className="w-full mt-10 pt-8 border-t border-white/5 space-y-4 text-left">
              <div className="flex items-center gap-3 text-slate-400">
                <FiMail className="shrink-0" />
                <span className="text-sm">{user?.username}@forensiai.internal</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <FiMapPin className="shrink-0" />
                <span className="text-sm">Secure Terminal: ST-042</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <FiClock className="shrink-0" />
                <span className="text-sm">Session: 04h 22m active</span>
              </div>
            </div>
          </div>

          <div className="soc-card p-6 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3 text-primary mb-3">
              <FiShield />
              <h3 className="text-xs font-bold uppercase tracking-widest">Security Clearance</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              You are currently operating under **Tier 2 Tactical Authorization**. Access to neural signal decryption and forensic reports is enabled.
            </p>
          </div>
        </div>

        {/* Detailed Info & Settings */}
        <div className="lg:col-span-2 space-y-8">
          <div className="soc-card p-8">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-8 flex items-center gap-3">
              <FiUser className="text-primary" /> Analyst Metadata
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileStat label="Deployment ID" value="AX-992-SEC" icon={FiCpu} />
              <ProfileStat label="Authorization" value="SOC_ANALYST_v2" icon={FiShield} />
              <ProfileStat label="Access Level" value="Level 4 (Tactical)" icon={FiShield} />
              <ProfileStat label="Last Login" value={new Date().toLocaleDateString()} icon={FiClock} />
            </div>
          </div>

          <div className="soc-card p-8">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-8 flex items-center gap-3">
              <FiKey className="text-primary" /> Security Credentials
            </h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                <div>
                  <div className="text-sm font-bold text-white">Multifactor Authentication</div>
                  <div className="text-xs text-slate-500 mt-1">Identity verification is active via internal hardware token.</div>
                </div>
                <div className="badge-success">Enabled</div>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                <div>
                  <div className="text-sm font-bold text-white">Encryption Keys</div>
                  <div className="text-xs text-slate-500 mt-1">Unique session keys are rotated every 8 hours.</div>
                </div>
                <button className="text-xs font-bold text-primary hover:underline">Rotate Now</button>
              </div>

              <button className="btn-outline w-full flex items-center justify-center gap-3 text-xs uppercase tracking-widest font-bold">
                <FiKey /> Reset Access Passphrase
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
