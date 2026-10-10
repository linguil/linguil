'use client';

import { useState, memo, type SVGProps } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { CheckCircle2, ShieldCheck, Trophy, Users } from 'lucide-react';

const DiscordIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    fill="currentColor"
  >
    <path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
  </svg>
);
DiscordIcon.displayName = 'DiscordIcon';

export const LinkDiscordButton = memo(() => {
  const { user, linkedDiscordId, linkWithDiscord } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Strictly check if current account is a Google or Email/Password account.
  const isGoogleOrEmail = Boolean(
    user &&
    !user.email?.endsWith('@linguil.app') &&
    user.providerData?.some(
      (p) => p.providerId === 'google.com' || p.providerId === 'password'
    )
  );

  if (!isGoogleOrEmail) {
    return null;
  }

  // If already linked with Discord, show a confirmed status badge.
  if (linkedDiscordId) {
    return (
      <div className="mt-8 flex justify-center items-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium shadow-sm transition-all">
          <DiscordIcon className="h-4 w-4 fill-[#5865F2]" />
          <span>Discord account linked</span>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </div>
      </div>
    );
  }

  const handleStartLink = async () => {
    setIsLinking(true);
    setErrorMessage(null);

    try {
      const success = await linkWithDiscord();
      if (success) {
        setIsDialogOpen(false);
        toast({
          title: 'Discord linked successfully',
          description: 'Your scores, friends, and linguil+ status are now synced with your Discord account',
        });
      }
    } catch (err: any) {
      console.error('Error linking Discord account:', err);
      const msg = err.message || 'Failed to link Discord account. Please try again.';
      setErrorMessage(msg);
      toast({
        title: 'Discord linking failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <>
      <div className="mt-8 mb-4 flex flex-col items-center justify-center">
        <Button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsDialogOpen(true);
          }}
          disabled={isLinking}
          className="group relative flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-[#5865F2] bg-[#5865F2]/10 hover:bg-[#5865F2] text-[#5865F2] dark:text-[#7983f5] hover:text-white dark:hover:text-white font-semibold text-sm transition-all duration-200 shadow-sm hover:shadow hover:scale-[1.02] active:scale-[0.98]"
        >
          <DiscordIcon className="h-4 w-4 fill-current transition-transform group-hover:scale-110 text-[#5865F2] dark:text-[#7983f5] group-hover:text-white dark:group-hover:text-white" />
          <span className="text-[#5865F2] dark:text-[#7983f5] group-hover:text-white dark:group-hover:text-white transition-colors">
            Link with Discord
          </span>
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md p-6 bg-card text-card-foreground border border-border rounded-xl shadow-lg">
          <DialogHeader className="text-left space-y-2">
            <div className="flex items-center gap-2.5 text-[#5865F2]">
              <div className="p-2 rounded-lg bg-[#5865F2]/10">
                <DiscordIcon className="h-6 w-6 fill-[#5865F2]" />
              </div>
              <DialogTitle className="text-xl font-bold text-foreground">Link with Discord</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-foreground/80 pt-1">
              Connect your Discord account to ensure the linguil Discord bot recognises your shared scores.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-sm">
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-background/80 dark:bg-background/60 border border-border/60 shadow-xs">
              <Trophy className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground text-sm">Merge scores</p>
                <p className="text-xs text-foreground/75 mt-0.5 leading-relaxed">
                  All scores across both accounts will be merged. If two scores exist for the same day, the highest score will be retained.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-background/80 dark:bg-background/60 border border-border/60 shadow-xs">
              <Users className="h-5 w-5 text-[#5865F2] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground text-sm">Sync friends</p>
                <p className="text-xs text-foreground/75 mt-0.5 leading-relaxed">
                  All friends across both accounts will be synced.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-background/80 dark:bg-background/60 border border-border/60 shadow-xs">
              <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground text-sm">Verify with bot</p>
                <p className="text-xs text-foreground/75 mt-0.5 leading-relaxed">
                  The Discord bot will now verify your shared scores with a 🐻 reaction.
                </p>
              </div>
            </div>

            {errorMessage && (
              <p className="text-destructive text-xs p-2.5 rounded bg-destructive/10 border border-destructive/20">
                {errorMessage}
              </p>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isLinking}
              className="w-full sm:w-auto border-border bg-background hover:bg-muted/30 text-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleStartLink}
              disabled={isLinking}
              className="w-full sm:w-auto bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {isLinking ? (
                <>
                  <LoadingSpinner className="h-4 w-4 text-white" />
                  <span>Linking...</span>
                </>
              ) : (
                <>
                  <DiscordIcon className="h-4 w-4 fill-white" />
                  <span>Authorise & Link</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

LinkDiscordButton.displayName = 'LinkDiscordButton';