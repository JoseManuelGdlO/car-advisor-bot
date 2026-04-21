import { FormEvent, useState } from "react";
import { Plus, Pencil, Trash2, HelpCircle } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type FaqItem = { id: string; question: string; answer: string };

export default function ConfigFaqs() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingFaq, setDeletingFaq] = useState<FaqItem | null>(null);
  const { data: faqs = [] } = useQuery({ queryKey: ["faqs"], queryFn: () => crmApi.getFaqs(token!), enabled: Boolean(token) }) as {
    data: FaqItem[];
  };

  const onCreateFaq = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !question.trim() || !answer.trim()) return;
    setSaving(true);
    try {
      await crmApi.createFaq(token, { question: question.trim(), answer: answer.trim() });
      await queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setQuestion("");
      setAnswer("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const openEditFaq = (faq: FaqItem) => {
    setEditingFaqId(faq.id);
    setEditQuestion(faq.question);
    setEditAnswer(faq.answer);
    setEditOpen(true);
  };

  const onEditFaq = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !editingFaqId || !editQuestion.trim() || !editAnswer.trim()) return;
    setSaving(true);
    try {
      await crmApi.updateFaq(token, editingFaqId, { question: editQuestion.trim(), answer: editAnswer.trim() });
      await queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setEditOpen(false);
      setEditingFaqId("");
      setEditQuestion("");
      setEditAnswer("");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteFaq = (faq: FaqItem) => {
    setDeletingFaq(faq);
    setDeleteOpen(true);
  };

  const onDeleteFaq = async () => {
    if (!token || !deletingFaq) return;
    setSaving(true);
    try {
      await crmApi.deleteFaq(token, deletingFaq.id);
      await queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setDeleteOpen(false);
      setDeletingFaq(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScreenHeader
        title="Preguntas frecuentes"
        subtitle={`${faqs.length} respuestas activas`}
        back
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full h-9 px-3 shadow-green">
                <Plus className="w-4 h-4" /> Nueva
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nueva pregunta frecuente</DialogTitle>
                <DialogDescription>Agrega una pregunta y su respuesta para el bot.</DialogDescription>
              </DialogHeader>
              <form className="space-y-3" onSubmit={onCreateFaq}>
                <Input placeholder="Pregunta" value={question} onChange={(e) => setQuestion(e.target.value)} />
                <Textarea placeholder="Respuesta" value={answer} onChange={(e) => setAnswer(e.target.value)} />
                <Button type="submit" className="w-full" disabled={saving || !question.trim() || !answer.trim()}>
                  {saving ? "Guardando..." : "Guardar FAQ"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <ul className="px-4 py-4 space-y-3">
        {faqs.map((f) => (
          <li
            key={f.id}
            className="bg-card rounded-2xl p-4 shadow-card border border-border"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-info/10 text-info grid place-items-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">{f.question}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{f.answer}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1 mt-2 -mr-1">
              <button
                className="text-muted-foreground hover:text-foreground p-2 rounded-lg"
                aria-label="Editar"
                onClick={() => openEditFaq(f)}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                className="text-muted-foreground hover:text-destructive p-2 rounded-lg"
                aria-label="Eliminar"
                onClick={() => openDeleteFaq(f)}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar FAQ</DialogTitle>
            <DialogDescription>Actualiza pregunta y respuesta.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onEditFaq}>
            <Input placeholder="Pregunta" value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)} />
            <Textarea placeholder="Respuesta" value={editAnswer} onChange={(e) => setEditAnswer(e.target.value)} />
            <Button type="submit" className="w-full" disabled={saving || !editQuestion.trim() || !editAnswer.trim()}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar FAQ</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{deletingFaq?.question}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="w-full" onClick={() => setDeleteOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="destructive" className="w-full" disabled={saving} onClick={onDeleteFaq}>
                {saving ? "Eliminando..." : "Si, estoy seguro"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
