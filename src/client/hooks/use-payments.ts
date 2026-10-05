'use client';

import { useReducer, useCallback } from 'react';
import { useToast } from '@/client/hooks/use-toast';
import { useAuth } from '@/client/hooks/use-auth';
import { purchase, OrderResultStatus } from '@devvit/web/client';

// State structure for payment processing.
interface PaymentsState {
  isProcessing: boolean;
  error: string | null;
}

// Actions available for the payments reducer.
type PaymentsAction =
  | { type: 'PROCESS_START' }
  | { type: 'PROCESS_SUCCESS' }
  | { type: 'PROCESS_ERROR'; payload: string }
  | { type: 'RESET' };

// Initial state for the payment process.
const initialState: PaymentsState = {
  isProcessing: false,
  error: null,
};

// Manages the state of payment operations.
const paymentsReducer = (state: PaymentsState, action: PaymentsAction): PaymentsState => {
  switch (action.type) {
    case 'PROCESS_START':
      return { isProcessing: true, error: null };
    case 'PROCESS_SUCCESS':
      return { isProcessing: false, error: null };
    case 'PROCESS_ERROR':
      return { isProcessing: false, error: action.payload };
    case 'RESET':
      return { isProcessing: false, error: null };
    default:
      return state;
  }
};

// Custom hook for handling Reddit Gold payments in Devvit.
const LINGUIL_PLUS_SKU = 'linguil_plus';

export const usePayments = () => {
  const { user } = useAuth(); // Get the current user from auth context.
  const [state, dispatch] = useReducer(paymentsReducer, initialState);
  const { toast } = useToast();

  // Displays an error notification.
  const showErrorToast = useCallback((title: string, description: string) => {
    toast({ title, description, variant: 'destructive' });
  }, [toast]);

  // Purchases linguil+ using Reddit Gold.
  const purchaseProduct = useCallback(async (sku: string = LINGUIL_PLUS_SKU, onPurchaseSuccess?: () => Promise<void>) => {
    dispatch({ type: 'PROCESS_START' });

    if (!user) {
      showErrorToast("Authentication error", "You must be signed in to make a purchase");
      dispatch({ type: 'PROCESS_ERROR', payload: 'User not authenticated' });
      return false;
    }

    try {
      const result = await purchase(sku);
      if (result.status !== OrderResultStatus.STATUS_SUCCESS) {
        const errorMessage = result.errorMessage || 'An unknown error occurred.';
        dispatch({ type: 'PROCESS_ERROR', payload: errorMessage });
        showErrorToast('Payment error', errorMessage);
        return false;
      }

      dispatch({ type: 'PROCESS_SUCCESS' });
      if (onPurchaseSuccess) {
        await onPurchaseSuccess();
      }
      return true;
    } catch (err: any) {
      const errorMessage = err?.message || 'An unexpected error occurred.';
      dispatch({ type: 'PROCESS_ERROR', payload: errorMessage });
      showErrorToast("Payment error", errorMessage);
      return false;
    }
  }, [showErrorToast, user]);

  const resetPayments = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return { ...state, purchaseProduct, resetPayments };
};