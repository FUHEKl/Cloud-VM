"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";

export default function ProfilePage() {
  const { user, fetchUser } = useAuth();
  const [profile, setProfile] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
  });
  const [passwords, setPasswords] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [profileMsg, setProfileMsg] = useState({ type: "", text: "" });
  const [passwordMsg, setPasswordMsg] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProfileMsg({ type: "", text: "" });
    try {
      await api.patch("/users/profile", profile);
      await fetchUser();
      setProfileMsg({ type: "success", text: "Profile updated successfully" });
    } catch (err: any) {
      setProfileMsg({
        type: "error",
        text: err.response?.data?.message || "Failed to update profile",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match" });
      return;
    }
    setChangingPw(true);
    setPasswordMsg({ type: "", text: "" });
    try {
      await api.patch("/users/profile/password", {
        oldPassword: passwords.oldPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordMsg({
        type: "success",
        text: "Password changed successfully",
      });
    } catch (err: any) {
      setPasswordMsg({
        type: "error",
        text: err.response?.data?.message || "Failed to change password",
      });
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-cyber-text mb-6">
        Profile Settings
      </h1>

      {/* Profile Form */}
      <div className="cyber-card mb-6">
        <h2 className="text-lg font-semibold text-cyber-text mb-4">
          Personal Information
        </h2>

        {profileMsg.text && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm ${
              profileMsg.type === "success"
                ? "bg-cyber-green/10 border border-cyber-green/30 text-cyber-green"
                : "bg-cyber-red/10 border border-cyber-red/30 text-cyber-red"
            }`}
          >
            {profileMsg.text}
          </div>
        )}

        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                First Name
              </label>
              <input
                type="text"
                className="cyber-input"
                value={profile.firstName}
                onChange={(e) =>
                  setProfile({ ...profile, firstName: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                Last Name
              </label>
              <input
                type="text"
                className="cyber-input"
                value={profile.lastName}
                onChange={(e) =>
                  setProfile({ ...profile, lastName: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
              Email
            </label>
            <input
              type="email"
              className="cyber-input"
              value={profile.email}
              onChange={(e) =>
                setProfile({ ...profile, email: e.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-cyber-text-dim">Role:</span>
            <span
              className={
                user?.role === "ADMIN"
                  ? "cyber-badge-orange"
                  : "cyber-badge-cyan"
              }
            >
              {user?.role}
            </span>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="cyber-btn-primary !py-2.5"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Password Form */}
      <div className="cyber-card">
        <h2 className="text-lg font-semibold text-cyber-text mb-4">
          Change Password
        </h2>

        {passwordMsg.text && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm ${
              passwordMsg.type === "success"
                ? "bg-cyber-green/10 border border-cyber-green/30 text-cyber-green"
                : "bg-cyber-red/10 border border-cyber-red/30 text-cyber-red"
            }`}
          >
            {passwordMsg.text}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              className="cyber-input"
              value={passwords.oldPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, oldPassword: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
              New Password
            </label>
            <input
              type="password"
              className="cyber-input"
              value={passwords.newPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, newPassword: e.target.value })
              }
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              className="cyber-input"
              value={passwords.confirmPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, confirmPassword: e.target.value })
              }
              required
            />
          </div>
          <button
            type="submit"
            disabled={changingPw}
            className="cyber-btn-secondary !py-2.5"
          >
            {changingPw ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
