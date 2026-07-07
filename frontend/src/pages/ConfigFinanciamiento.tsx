import { FormEvent, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Landmark, ListChecks, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { FinancingPlanDto, FinancingRequirementDto, crmApi } from "@/services/crm";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { normalizeApiError } from "@/lib/formErrors";

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
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [planOpen, setPlanOpen] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [requirementTitle, setRequirementTitle] = useState("");
  const [requirementDescription, setRequirementDescription] = useState("");
  const [editRequirementOpen, setEditRequirementOpen] = useState(false);
  const [editingRequirementId, setEditingRequirementId] = useState("");
  const [editRequirementTitle, setEditRequirementTitle] = useState("");
  const [editRequirementDescription, setEditRequirementDescription] = useState("");
  const [deleteRequirementOpen, setDeleteRequirementOpen] = useState(false);
  const [deletingRequirement, setDeletingRequirement] = useState<FinancingRequirementDto | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState<FinancingPlanDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [planFormError, setPlanFormError] = useState("");
  const [requirementFormError, setRequirementFormError] = useState("");
  const [editRequirementError, setEditRequirementError] = useState("");
  const [deleteRequirementError, setDeleteRequirementError] = useState("");
  const [deleteFormError, setDeleteFormError] = useState("");

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
  const focusedPlanId = searchParams.get("planId");

  const planDialogTitle = useMemo(() => (form.id ? "Editar plan" : "Nuevo plan"), [form.id]);
  const planDialogDescription = useMemo(
    () => (form.id ? "Actualiza los datos del plan de financiamiento." : "Crea un plan para ofrecerlo a tus clientes."),
    [form.id],
  );

  useEffect(() => {
    if (!focusedPlanId) return;
    const element = document.getElementById(`plan-${focusedPlanId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedPlanId, plans.length]);

  const resetForm = () => setForm(emptyForm);

  const openNewPlan = () => {
    resetForm();
    setPlanFormError("");
    setPlanOpen(true);
  };

  const startEditPlan = (plan: FinancingPlanDto) => {
    setPlanFormError("");
    setForm({
      id: plan.id,
      name: plan.name,
      lender: plan.lender,
      rate: String(plan.rate),
      maxTermMonths: String(plan.maxTermMonths),
      active: plan.active,
      showRate: plan.showRate,
    });
    setPlanOpen(true);
  };

  const submitPlan = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !form.name || !form.lender || !form.rate || !form.maxTermMonths) return;
    setSaving(true);
    setPlanFormError("");
    const payload = {
      name: form.name.trim(),
      lender: form.lender.trim(),
      rate: Number(form.rate),
      maxTermMonths: Number(form.maxTermMonths),
      active: form.active,
      showRate: form.showRate,
    };
    try {
      if (form.id) {
        await crmApi.updateFinancingPlan(token, form.id, payload);
      } else {
        await crmApi.createFinancingPlan(token, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["financing-plans"] });
      setPlanOpen(false);
      resetForm();
    } catch (err) {
      setPlanFormError(normalizeApiError(err, "No se pudo guardar el plan.").formError);
    } finally {
      setSaving(false);
    }
  };

  const openDeletePlan = (plan: FinancingPlanDto) => {
    setDeletingPlan(plan);
    setDeleteOpen(true);
  };

  const deletePlan = async () => {
    if (!token || !deletingPlan) return;
    setDeleting(true);
    setDeleteFormError("");
    try {
      await crmApi.deleteFinancingPlan(token, deletingPlan.id);
      await queryClient.invalidateQueries({ queryKey: ["financing-plans"] });
      setDeleteOpen(false);
      setDeletingPlan(null);
      if (form.id === deletingPlan.id) {
        setPlanOpen(false);
        resetForm();
      }
    } catch (err) {
      setDeleteFormError(normalizeApiError(err, "No se pudo eliminar el plan.").formError);
    } finally {
      setDeleting(false);
    }
  };

  const createRequirement = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !requirementTitle.trim() || !requirementDescription.trim()) return;
    setSaving(true);
    setRequirementFormError("");
    try {
      await crmApi.createFinancingRequirement(token, {
        title: requirementTitle.trim(),
        description: requirementDescription.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["financing-requirements"] });
      setRequirementTitle("");
      setRequirementDescription("");
    } catch (err) {
      setRequirementFormError(normalizeApiError(err, "No se pudo agregar el requisito.").formError);
    } finally {
      setSaving(false);
    }
  };

  const startEditRequirement = (req: FinancingRequirementDto) => {
    setEditingRequirementId(req.id);
    setEditRequirementTitle(req.title);
    setEditRequirementDescription(req.description);
    setEditRequirementError("");
    setEditRequirementOpen(true);
  };

  const submitEditRequirement = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !editingRequirementId || !editRequirementTitle.trim() || !editRequirementDescription.trim()) return;
    setSaving(true);
    setEditRequirementError("");
    try {
      await crmApi.updateFinancingRequirement(token, editingRequirementId, {
        title: editRequirementTitle.trim(),
        description: editRequirementDescription.trim(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financing-requirements"] }),
        queryClient.invalidateQueries({ queryKey: ["financing-plans"] }),
      ]);
      setEditRequirementOpen(false);
      setEditingRequirementId("");
      setEditRequirementTitle("");
      setEditRequirementDescription("");
    } catch (err) {
      setEditRequirementError(normalizeApiError(err, "No se pudo actualizar el requisito.").formError);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteRequirement = (req: FinancingRequirementDto) => {
    setDeletingRequirement(req);
    setDeleteRequirementOpen(true);
  };

  const deleteRequirement = async () => {
    if (!token || !deletingRequirement) return;
    setSaving(true);
    setDeleteRequirementError("");
    try {
      await crmApi.deleteFinancingRequirement(token, deletingRequirement.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financing-requirements"] }),
        queryClient.invalidateQueries({ queryKey: ["financing-plans"] }),
      ]);
      setDeleteRequirementOpen(false);
      setDeletingRequirement(null);
      if (editingRequirementId === deletingRequirement.id) {
        setEditRequirementOpen(false);
        setEditingRequirementId("");
        setEditRequirementTitle("");
        setEditRequirementDescription("");
      }
    } catch (err) {
      setDeleteRequirementError(normalizeApiError(err, "No se pudo eliminar el requisito.").formError);
    } finally {
      setSaving(false);
    }
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

      <div className="grid grid-cols-2 gap-2 px-4 pt-3 pb-1">
        <Dialog
              open={requirementsOpen}
              onOpenChange={(open) => {
                setRequirementsOpen(open);
                if (!open) {
                  setRequirementFormError("");
                  setRequirementTitle("");
                  setRequirementDescription("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full rounded-full h-9 px-2.5 text-xs gap-1 border-primary/50 bg-primary/10 text-primary-dark font-semibold hover:bg-primary/15 hover:text-primary-dark"
                  aria-label="Agregar un requisito al catálogo"
                >
                  <ListChecks className="w-4 h-4 shrink-0" />
                  Nuevo requisito
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md overflow-x-hidden max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Catálogo de requisitos</DialogTitle>
                  <DialogDescription>
                    Administra requisitos reutilizables y asígnalos a cada plan desde su tarjeta.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {(requirements as FinancingRequirementDto[]).length > 0 ? (
                    <div className="space-y-2 max-h-52 overflow-y-auto rounded-lg border border-border p-2">
                      {(requirements as FinancingRequirementDto[]).map((req) => (
                        <div
                          key={req.id}
                          className="flex items-start gap-2 rounded-lg p-2 hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold break-words">{req.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 break-words line-clamp-2">
                              {req.description}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5 -mr-1">
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                              aria-label={`Editar ${req.title}`}
                              onClick={() => startEditRequirement(req)}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted"
                              aria-label={`Eliminar ${req.title}`}
                              onClick={() => openDeleteRequirement(req)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Aún no hay requisitos en el catálogo.</p>
                  )}

                  <div className="border-t border-border pt-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">Agregar requisito</p>
                    <form onSubmit={createRequirement} className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="requirement-title">Título</Label>
                        <Input
                          id="requirement-title"
                          placeholder="Ej. Comprobante de ingresos"
                          value={requirementTitle}
                          onChange={(e) => setRequirementTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="requirement-description">Descripción</Label>
                        <Textarea
                          id="requirement-description"
                          placeholder="Detalla qué documentos o condiciones aplica"
                          value={requirementDescription}
                          onChange={(e) => setRequirementDescription(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={saving || !requirementTitle.trim() || !requirementDescription.trim()}
                      >
                        <Plus className="w-4 h-4" />
                        {saving ? "Guardando..." : "Agregar requisito"}
                      </Button>
                      <FormErrorAlert title="No se pudo agregar el requisito" message={requirementFormError} />
                    </form>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog
              open={planOpen}
              onOpenChange={(open) => {
                setPlanOpen(open);
                if (!open) {
                  setPlanFormError("");
                  resetForm();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="w-full rounded-full h-9 px-2.5 text-xs gap-1 shadow-green"
                  onClick={openNewPlan}
                  aria-label="Crear un plan de financiamiento"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  Nuevo plan
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md overflow-x-hidden">
                <DialogHeader>
                  <DialogTitle>{planDialogTitle}</DialogTitle>
                  <DialogDescription>{planDialogDescription}</DialogDescription>
                </DialogHeader>
                <form onSubmit={submitPlan} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="plan-name">Nombre del plan</Label>
                    <Input
                      id="plan-name"
                      placeholder="Ej. Plan Avanza Tradicional"
                      value={form.name}
                      onChange={(e) => setForm((old) => ({ ...old, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-lender">Institución financiera</Label>
                    <Input
                      id="plan-lender"
                      placeholder="Ej. BBVA Bancomer"
                      value={form.lender}
                      onChange={(e) => setForm((old) => ({ ...old, lender: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="plan-rate">Tasa anual</Label>
                      <div className="relative">
                        <Input
                          id="plan-rate"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="14.50"
                          className="pr-8"
                          value={form.rate}
                          onChange={(e) => setForm((old) => ({ ...old, rate: e.target.value }))}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plan-term">Plazo máximo</Label>
                      <div className="relative">
                        <Input
                          id="plan-term"
                          type="number"
                          min="1"
                          placeholder="48"
                          className="pr-14"
                          value={form.maxTermMonths}
                          onChange={(e) => setForm((old) => ({ ...old, maxTermMonths: e.target.value }))}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          meses
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Mostrar tasa al cliente</p>
                        <p className="text-xs text-muted-foreground">Visible en el chat y cotizaciones</p>
                      </div>
                      <Switch
                        checked={form.showRate}
                        onCheckedChange={(value) => setForm((old) => ({ ...old, showRate: Boolean(value) }))}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Plan activo</p>
                        <p className="text-xs text-muted-foreground">Disponible para asignar a vehículos</p>
                      </div>
                      <Switch
                        checked={form.active}
                        onCheckedChange={(value) => setForm((old) => ({ ...old, active: Boolean(value) }))}
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={saving || !form.name.trim() || !form.lender.trim() || !form.rate || !form.maxTermMonths}
                  >
                    <Save className="w-4 h-4" />
                    {saving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear plan"}
                  </Button>
                  <FormErrorAlert title="No se pudo guardar el plan" message={planFormError} />
                </form>
              </DialogContent>
            </Dialog>
      </div>

      <ul className="px-4 pb-4 pt-2 space-y-3">
        {plans.map((plan) => (
          <li
            id={`plan-${plan.id}`}
            key={plan.id}
            className={`bg-card rounded-2xl border border-border p-4 shadow-card ${
              focusedPlanId === plan.id ? "ring-2 ring-primary/60" : ""
            }`}
          >
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
                  onClick={() => startEditPlan(plan)}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-muted text-destructive" onClick={() => openDeletePlan(plan)}>
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

      <Dialog
        open={editRequirementOpen}
        onOpenChange={(open) => {
          setEditRequirementOpen(open);
          if (!open) setEditRequirementError("");
        }}
      >
        <DialogContent className="max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Editar requisito</DialogTitle>
            <DialogDescription>Actualiza el título y la descripción del requisito.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEditRequirement} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="edit-requirement-title">Título</Label>
              <Input
                id="edit-requirement-title"
                value={editRequirementTitle}
                onChange={(e) => setEditRequirementTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-requirement-description">Descripción</Label>
              <Textarea
                id="edit-requirement-description"
                value={editRequirementDescription}
                onChange={(e) => setEditRequirementDescription(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={saving || !editRequirementTitle.trim() || !editRequirementDescription.trim()}
            >
              <Save className="w-4 h-4" />
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
            <FormErrorAlert title="No se pudo actualizar el requisito" message={editRequirementError} />
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteRequirementOpen}
        onOpenChange={(open) => {
          setDeleteRequirementOpen(open);
          if (!open) setDeleteRequirementError("");
        }}
      >
        <DialogContent className="max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Eliminar requisito</DialogTitle>
            <DialogDescription>
              Se quitará del catálogo y de los planes donde esté asignado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-semibold break-words">{deletingRequirement?.title}</p>
            {deletingRequirement?.description ? (
              <p className="text-xs text-muted-foreground break-words">{deletingRequirement.description}</p>
            ) : null}
            <div className="flex gap-2">
              <Button variant="outline" className="w-full" onClick={() => setDeleteRequirementOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="destructive" className="w-full" onClick={deleteRequirement} disabled={saving}>
                {saving ? "Eliminando..." : "Si, eliminar"}
              </Button>
            </div>
            <FormErrorAlert title="No se pudo eliminar el requisito" message={deleteRequirementError} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteFormError("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar plan de financiamiento</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-semibold">{deletingPlan?.name}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="w-full" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="destructive" className="w-full" onClick={deletePlan} disabled={deleting}>
                {deleting ? "Eliminando..." : "Si, eliminar"}
              </Button>
            </div>
            <FormErrorAlert title="No se pudo eliminar el plan" message={deleteFormError} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
