"use client";

import { signOut } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Перед выходом (закрыть меню / drawer) */
  onBeforeSignOut?: () => void;
};

export const SignOutConfirmDialog = ({ open, onOpenChange, onBeforeSignOut }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Выйти из аккаунта?</DialogTitle>
        <DialogDescription>Сессия будет завершена, для доступа нужно будет войти снова.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Отмена
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            onBeforeSignOut?.();
            onOpenChange(false);
            void signOut();
          }}
        >
          Выйти
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
