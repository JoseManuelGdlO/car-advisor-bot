import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { UseMutationResult } from "@tanstack/react-query";

interface DeleteAccountProps {
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  deleteFormError: string;
  setDeleteFormError: (error: string) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (text: string) => void;
  deleteAccountMutation: UseMutationResult<void, Error, void>;
}

export default function DeleteAccount({
  deleteDialogOpen,
  setDeleteDialogOpen,
  deleteFormError,
  setDeleteFormError,
  deleteConfirmText,
  setDeleteConfirmText,
  deleteAccountMutation,
}: DeleteAccountProps) {
  return (
    <div className="bg-card rounded-2xl p-4 shadow-card border border-destructive/30 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
        <div>
          <p className="font-semibold text-sm text-destructive">
            Eliminar cuenta
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Eliminará de forma permanente tu usuario y los datos asociados.
          </p>
        </div>
      </div>
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteFormError("");
        }}
      >
        <DialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            Iniciar eliminación de cuenta
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminación de cuenta</DialogTitle>
            <DialogDescription>
              Esta acción es permanente. Para continuar, escribe{" "}
              <strong>ELIMINAR</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Confirmación</Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="ELIMINAR"
            />
          </div>
          <Button
            variant="destructive"
            className="w-full"
            disabled={
              deleteAccountMutation.isPending ||
              deleteConfirmText.trim().toUpperCase() !== "ELIMINAR"
            }
            onClick={() => deleteAccountMutation.mutate()}
          >
            {deleteAccountMutation.isPending
              ? "Eliminando..."
              : "Eliminar cuenta definitivamente"}
          </Button>
          <FormErrorAlert
            title="No se pudo eliminar la cuenta"
            message={deleteFormError}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
