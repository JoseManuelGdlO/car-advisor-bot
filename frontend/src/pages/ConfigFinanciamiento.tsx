import { FormEvent, useMemo, useState } from "react";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/AuthContext";
import { FinancingPlanDto, FinancingRequirementDto, crmApi } from "@/services/crm";

type PlanFormState = {
  id?: string;
  name: string;
  lender: string;
  rate: string;
  maxTermMonths: string;
  active: boolean;
  showRate: boolean;
};

const emptyForm: PlanFormState = {
  name: "",
  lender: "",
  rate: "",
  maxTermMonths: "48",
  active: true,
  showRate: true,
};

export default function ConfigFinanciamiento() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [requirementTitle, setRequirementTitle] = useState("");
  const [requirementDescription, setRequirementDescription] = useState("");

  const { data: plansData = [] } = useQuery({
    queryKey: ["financing-plans"],
    queryFn: () => crmApi.getFinancingPlans(token!),
    enabled: Boolean(token),
  });
  const { data: requirements = [] } = useQuery({
    queryKey: ["financing-requirements"],
    queryFn: () => crmApi.getFinancingRequirements(token!),
    enabled: Boolean(token),
  });
  const plans = plansData as FinancingPlanDto[];

  const title = useMemo(() => (form.id ? "Editar plan" : "Nuevo plan"), [form.id]);

  const resetForm = () => setForm(emptyForm);

  const submitPlan = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !form.name || !form.lender || !form.rate || !form.maxTermMonths) return;
    const payload = {
      name: form.name,
      lender: form.lender,
      rate: Number(form.rate),
      maxTermMonths: Number(form.maxTermMonths),
      active: form.active,
      showRate: form.showRate,
    };
    if (form.id) {
      await crmApi.updateFinancingPlan(token, form.id, payload);
    } else {
      await crmApi.createFinancingPlan(token, payload);
    }
    await queryClient.invalidateQueries({ queryKey: ["financing-plans"] });
    resetForm();
  };

  const deletePlan = async (id: string) => {
    if (!token) return;
    await crmApi.deleteFinancingPlan(token, id);
    await queryClient.invalidateQueries({ queryKey: ["financing-plans"] });
  };

  const createRequirement = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !requirementTitle || !requirementDescription) return;
    await crmApi.createFinancingRequirement(token, { title: requirementTitle, description: requirementDescription });
    await queryClient.invalidateQueries({ queryKey: ["financing-requirements"] });
    setRequirementTitle("");
    setRequirementDescription("");
  };

  const toggleRequirement = async (planId: string, requirementId: string, selected: boolean) => {
    if (!token) return;
    if (selected) {
      await crmApi.removeRequirementFromPlan(token, planId, requirementId);
    } else {
      await crmApi.assignRequirementToPlan(token, planId, requirementId);
    }
    await queryClient.invalidateQueries({ queryKey: ["financing-plans"] });
  };

  return (
    <>
      <ScreenHeader title="Financiamiento" subtitle={`${plans.length} planes`} back />

      <div className="px-4 py-4 space-y-4">
        <form onSubmit={submitPlan} className="bg-card rounded-2xl border border-border p-4 space-y-3 shadow-card">
          <p className="text-sm font-bold">{title}</p>
          <Input
            placeholder="Nombre del plan"
            value={form.name}
            onChange={(e) => setForm((old) => ({ ...old, name: e.target.value }))}
          />
          <Input
            placeholder="Institución financiera"
            value={form.lender}
            onChange={(e) => setForm((old) => ({ ...old, lender: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Tasa %"
              value={form.rate}
              onChange={(e) => setForm((old) => ({ ...old, rate: e.target.value }))}
            />
            <Input
              type="number"
              min="1"
              placeholder="Plazo máximo"
              value={form.maxTermMonths}
              onChange={(e) => setForm((old) => ({ ...old, maxTermMonths: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.showRate} onCheckedChange={(value) => setForm((old) => ({ ...old, showRate: Boolean(value) }))} />
            Mostrar tasa al cliente
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.active} onCheckedChange={(value) => setForm((old) => ({ ...old, active: Boolean(value) }))} />
            Plan activo
          </label>
          <div className="flex gap-2">
            <Button size="sm" type="submit" className="rounded-full h-9 px-3">
              <Plus className="w-4 h-4" /> {form.id ? "Guardar cambios" : "Crear plan"}
            </Button>
            {form.id ? (
              <Button size="sm" type="button" variant="outline" className="rounded-full h-9 px-3" onClick={resetForm}>
                Cancelar edición
              </Button>
            ) : null}
          </div>
        </form>

        <form onSubmit={createRequirement} className="bg-card rounded-2xl border border-border p-4 space-y-3 shadow-card">
          <p className="text-sm font-bold">Catálogo de requisitos</p>
          <Input placeholder="Título del requisito" value={requirementTitle} onChange={(e) => setRequirementTitle(e.target.value)} />
          <Textarea
            placeholder="Descripción del requisito"
            value={requirementDescription}
            onChange={(e) => setRequirementDescription(e.target.value)}
          />
          <Button size="sm" type="submit" className="rounded-full h-9 px-3">
            <Plus className="w-4 h-4" /> Agregar requisito
          </Button>
        </form>

        <ul className="space-y-3">
          {plans.map((plan) => (
            <li key={plan.id} className="bg-card rounded-2xl border border-border p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-sm flex items-center gap-2">
                    <Landmark className="w-4 h-4" /> {plan.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{plan.lender}</p>
                  <p className="text-xs mt-1">
                    {plan.showRate ? `${Number(plan.rate).toFixed(2)}%` : "Tasa oculta"} · Hasta {plan.maxTermMonths} meses
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 rounded-lg hover:bg-muted"
                    onClick={() =>
                      setForm({
                        id: plan.id,
                        name: plan.name,
                        lender: plan.lender,
                        rate: String(plan.rate),
                        maxTermMonths: String(plan.maxTermMonths),
                        active: plan.active,
                        showRate: plan.showRate,
                      })
                    }
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-muted text-destructive" onClick={() => deletePlan(plan.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 border-t border-border pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Requisitos</p>
                {(requirements as FinancingRequirementDto[]).map((req) => {
                  const selected = Boolean(plan.requirements?.some((x) => x.id === req.id));
                  return (
                    <label key={req.id} className="flex items-start gap-2 text-xs">
                      <Checkbox checked={selected} onCheckedChange={() => toggleRequirement(plan.id, req.id, selected)} />
                      <span>
                        <span className="font-semibold">{req.title}</span> - {req.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
