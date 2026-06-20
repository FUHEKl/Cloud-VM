"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

type University = {
  id: string;
  name: string;
  emailDomain: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  name: string;
  emailDomain: string;
};

const UNIVERSITY_DOMAIN_REGEX = /^[@.][a-z0-9.-]+\.[a-z]{2,}$/;

const emptyForm: FormState = {
  name: "",
  emailDomain: "",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function validateForm(form: FormState) {
  const name = form.name.trim();
  const emailDomain = form.emailDomain.trim();

  if (!name) return "University name is required.";
  if (name.length > 200) return "University name must be 200 characters or fewer.";
  if (!emailDomain) return "Email domain is required.";
  if (emailDomain !== emailDomain.toLowerCase()) return "Email domain must be lowercase.";
  if (!UNIVERSITY_DOMAIN_REGEX.test(emailDomain)) {
    return "Email domain must start with @ or . and match the expected format.";
  }

  return "";
}

export default function AdminUniversitiesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUniversity, setEditingUniversity] = useState<University | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (user?.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [isLoading, router, user?.role]);

  const loadUniversities = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<University[]>("/users/admin/universities");
      setUniversities(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load universities.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading || user?.role !== "ADMIN") return;
    void loadUniversities();
  }, [isLoading, loadUniversities, user?.role]);

  const orderedUniversities = useMemo(
    () => [...universities].sort((a, b) => a.name.localeCompare(b.name)),
    [universities],
  );

  const openCreateModal = () => {
    setEditingUniversity(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const openEditModal = (university: University) => {
    setEditingUniversity(university);
    setForm({ name: university.name, emailDomain: university.emailDomain });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingUniversity(null);
    setForm(emptyForm);
    setFormError("");
  };

  const submitForm = async () => {
    const validationMessage = validateForm(form);
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    const payload = {
      name: form.name.trim(),
      emailDomain: form.emailDomain.trim(),
    };

    setSaving(true);
    setFormError("");
    try {
      if (editingUniversity) {
        await api.patch(`/users/admin/universities/${editingUniversity.id}`, payload);
      } else {
        await api.post("/users/admin/universities", payload);
      }
      await loadUniversities();
      setSaving(false);
      closeModal();
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save university.";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleUniversity = async (university: University) => {
    setActionBusyId(university.id);
    setError("");
    try {
      await api.patch(`/users/admin/universities/${university.id}/toggle`);
      await loadUniversities();
    } catch {
      setError("Failed to update university status.");
    } finally {
      setActionBusyId(null);
    }
  };

  const deleteUniversity = async (university: University) => {
    const confirmed = window.confirm(
      "Delete this university? Verified students using this email domain may lose verification if the domain is removed.",
    );
    if (!confirmed) return;

    setActionBusyId(university.id);
    setError("");
    try {
      await api.delete(`/users/admin/universities/${university.id}`);
      await loadUniversities();
    } catch {
      setError("Failed to delete university.");
    } finally {
      setActionBusyId(null);
    }
  };

  if (isLoading || user?.role !== "ADMIN") {
    return <div className="text-cyber-text-dim">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-cyber-text mb-2">Universities</h1>
          <p className="text-cyber-text-dim text-sm">
            Manage allowed student email domains and keep verification rules in sync with the database.
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className="cyber-btn-primary">
          Add university
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
          {error}
        </div>
      )}

      <div className="cyber-card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-cyber-text-dim">Loading universities...</p>
        ) : orderedUniversities.length === 0 ? (
          <p className="text-sm text-cyber-text-dim">No universities configured yet.</p>
        ) : (
          <table className="cyber-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email Domain</th>
                <th>Active</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderedUniversities.map((university) => (
                <tr key={university.id}>
                  <td className="font-medium text-cyber-text">{university.name}</td>
                  <td className="text-cyber-text-dim">{university.emailDomain}</td>
                  <td>
                    <button
                      type="button"
                      disabled={actionBusyId === university.id}
                      onClick={() => void toggleUniversity(university)}
                      className={
                        university.isActive
                          ? "cyber-badge-green cursor-pointer"
                          : "cyber-badge-red cursor-pointer"
                      }
                    >
                      {university.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="text-cyber-text-dim text-sm">{formatDate(university.createdAt)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(university)}
                        className="cyber-btn-secondary !py-1.5 !px-3 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteUniversity(university)}
                        disabled={actionBusyId === university.id}
                        className="text-cyber-text-dim hover:text-cyber-red transition-colors"
                        title="Delete university"
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="cyber-card w-full max-w-lg space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-cyber-text">
                  {editingUniversity ? "Edit university" : "Add university"}
                </h2>
                <p className="text-sm text-cyber-text-dim">
                  {editingUniversity
                    ? "Update the university name or email domain."
                    : "Create a new university and allow its student email domain."}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="text-cyber-text-dim hover:text-cyber-text">
                ✕
              </button>
            </div>

            {formError && (
              <div className="px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
                {formError}
              </div>
            )}

            <label className="block text-sm text-cyber-text-dim space-y-1">
              <span>Name</span>
              <input
                className="cyber-input w-full"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={200}
                placeholder="University of Example"
              />
            </label>

            <label className="block text-sm text-cyber-text-dim space-y-1">
              <span>Email domain</span>
              <input
                className="cyber-input w-full"
                value={form.emailDomain}
                onChange={(e) => setForm((prev) => ({ ...prev, emailDomain: e.target.value }))}
                placeholder="@university.tn"
              />
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className="cyber-btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={() => void submitForm()} disabled={saving} className="cyber-btn-primary">
                {saving ? "Saving..." : editingUniversity ? "Save changes" : "Create university"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
