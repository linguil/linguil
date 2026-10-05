'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/client/components/ui/dialog';
import { VisuallyHidden } from '@/client/components/ui/visually-hidden';
import { Button } from '@/client/components/ui/button';
import { usePayments } from '@/client/hooks/use-payments';

// Defines the props for the PaymentDialog component.
export interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchaseSuccess: () => Promise<void>;
}

// Displays a dialog for the user to unlock linguil+ with Reddit Gold.
export const PaymentDialog = ({ open, onOpenChange, onPurchaseSuccess }: PaymentDialogProps) => {
  const { isProcessing, error, purchaseProduct, resetPayments } = usePayments();

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetPayments();
    }
    onOpenChange(newOpen);
  };

  // Handles the Reddit Gold payment flow.
  const handleRedditGoldPayment = async () => {
    const success = await purchaseProduct(undefined, onPurchaseSuccess);
    if (success) {
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideCloseButton className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Unlock linguil+</DialogTitle>
          <VisuallyHidden>
            <DialogDescription>
              Unlock unlimited, offline games with Reddit Gold.
            </DialogDescription>
          </VisuallyHidden>
        </DialogHeader>
        <p className="mb-2 mt-2">Unlimited, offline games</p>
        <p className="text-sm text-muted-foreground mb-4 italic">
          Note: Offline games do not affect leaderboards.
        </p>
        <div className="flex flex-col gap-2 items-center">
          {/* Button to initiate a payment with Reddit Gold. */}
          <Button onClick={handleRedditGoldPayment} disabled={isProcessing} className="w-full">
            {isProcessing ? 'Processing...' : 'Pay with Reddit Gold'}
          </Button>
          {/* Display any payment-related errors. */}
          {error && <p className="text-sm text-destructive mt-2 text-center">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
};