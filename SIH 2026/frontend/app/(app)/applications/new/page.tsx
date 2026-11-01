"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiSend, useAuth } from "@/lib/auth";
import type { Institution } from "@/lib/types";
import { ErrorBox, Field, inputClass } from "@/components/ui";

type ApplicationCategory = {
  code: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
};

const ACADEMIC_YEARS = ["2026-27", "2025-26", "2027-28"];

export default function NewApplicationPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [categories, setCategories] = useState<ApplicationCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);

  const [form, setForm] = useState({
    institution_id: "",
    category_code: "EOA",
    academic_year: "2026-27",
    title: "",
  });

  useEffect(() => {
    apiGet<{ institutions: Institution[] }>(token, "/institutions")
      .then((data) => {
        setInstitutions(data.institutions);
        setForm((current) => ({
          ...current,
          institution_id: current.institution_id || data.institutions[0]?.id || "",
        }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Institutions could not be loaded."));
    apiGet<{ categories: ApplicationCategory[] }>(token, "/intake/application-categories")
      .then((data) => {
        const enabled = data.categories.filter((category) => category.is_enabled);
        setCategories(enabled);
        if (enabled.length && !enabled.some((category) => category.code === "EOA")) {
          setForm((current) => ({ ...current, category_code: enabled[0].code }));
        }
      })
      .catch(() => undefined);
  }, [token]);

  const institution = useMemo(
    () => institutions?.find((entry) => entry.id === form.institution_id) ?? null,
    [institutions, form.institution_id]
  );
  const categoryName = useMemo(
    () => categories.find((entry) => entry.code === form.category_code)?.name ?? form.category_code,
    [categories, form.category_code]
  );

  const suggestedTitle = institution
    ? `${categoryName} — ${institution.name} — ${form.academic_year}`
    : `${categoryName} — ${form.academic_year}`;
  const title = titleEdited ? form.title : suggestedTitle;

  async function createApplication() {
    setError(null);
    if (!form.institution_id) {
      setError("Select an institution before continuing.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(form.academic_year)) {
      setError("Academic year must look like 2026-27.");
      return;
    }
    if (title.trim().length < 3) {
      setError("Give the application a title of at least 3 characters.");
      return;
    }
    setBusy(true);
    try {
      const response = await apiSend<{ id: string }>(token, "/applications", "POST", {
        institution_id: form.institution_id,
        category_code: form.category_code,
        academic_year: form.academic_year,
        title: title.trim(),
        priority: "normal",
        declared_data: {
          institution_name: institution?.name ?? "",
          aicte_pid: institution?.aicte_pid ?? "",
        },
      });
      router.push(`/intake/${response.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the application.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-[#0B1230]">Create application</h1>
        <p className="mt-1 text-[12.5px] text-[#5A6580]">
          Four details, then you land directly in the document workspace where the required documents are uploaded and read.
        </p>
      </div>

      <ErrorBox message={error} />

      <div className="rounded-xl border border-[#E3E8F2] bg-white p-5">
        <div className="space-y-4">
          <Field label="Institution name">
            <select
              className={inputClass}
              value={form.institution_id}
              onChange={(e) => setForm({ ...form, institution_id: e.target.value })}
              disabled={!institutions}
            >
              {!institutions || institutions.length === 0 ? (
                <option value="">No institution available</option>
              ) : (
                institutions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.aicte_pid ? ` · ${entry.aicte_pid}` : ""}
                  </option>
                ))
              )}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Application category">
              <select
                className={inputClass}
                value={form.category_code}
                onChange={(e) => setForm({ ...form, category_code: e.target.value })}
              >
                {(categories.length ? categories : [{ code: "EOA", name: "Extension of Approval" }]).map((category) => (
                  <option key={category.code} value={category.code}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic year">
              <select
                className={inputClass}
                value={form.academic_year}
                onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
              >
                {ACADEMIC_YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Application title (generated, editable)">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => {
                setTitleEdited(true);
                setForm({ ...form, title: e.target.value });
              }}
            />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Link href="/applications" className="text-[12px] text-[#7B879F] hover:text-[#0B1230]">
            Cancel
          </Link>
          <button
            onClick={() => void createApplication()}
            disabled={busy || !institutions?.length}
            className="rounded-lg bg-[#2F6BFF] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#2557d6] disabled:bg-[#A9BEF5]"
          >
            {busy ? "Creating…" : "Create application & continue →"}
          </button>
        </div>
      </div>

      <p className="text-[11px] leading-5 text-[#7B879F]">
        The document checklist is generated from the selected category and academic year. Drafts stay in Applications and can be
        reopened at any time.
      </p>
    </div>
  );
}
