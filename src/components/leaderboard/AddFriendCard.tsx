'use client';

import { memo, useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Clipboard } from 'lucide-react';
import type { User } from 'firebase/auth';
import { Label } from '@/components/ui/label';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';

// Dynamically import `QRCodeScannerDialog` to reduce bundle size.
const QRCodeScannerDialog = dynamic(() => import('@/components/leaderboard/QRCodeScannerDialog').then(mod => mod.QRCodeScannerDialog), { ssr: false, loading: () => <LoadingSpinner /> });

// Props for AddFriendCard.
type AddFriendCardProps = {
  // Friend's UID from the input.
  friendUid: string;
  // Callback to update friend's UID.
  onFriendUidChange: (uid: string) => void;
  // Callback to add a friend.
  onAddFriend: (uid: string) => void;
  // Callback to copy user's ID.
  onCopy: () => void;
  // Current user object.
  user: User;
};

// Displays the user's ID and a copy button.
const YourIdSection = memo(({ userId, onCopy }: { userId: string, onCopy: () => void }) => (
  <div className="flex items-stretch gap-2 h-9">
    <p className="text-xs p-1 bg-muted text-friend-box-foreground rounded-md flex items-center">Your ID:</p>
    <span className="text-xs md:text-sm font-mono p-1 bg-background rounded-md flex items-center justify-center grow">{userId}</span>
    <Button onClick={onCopy} size="icon" variant="default" className="h-full w-9 shrink-0" aria-label="Copy your user ID">
      <Clipboard className="h-4 w-4" />
    </Button>
  </div>
));
YourIdSection.displayName = 'YourIdSection';

// Displays the user's QR code with a loading state.
const YourQrCodeSection = memo(({ qrCodeDataUrl, layout = 'vertical' }: { qrCodeDataUrl: string | null, layout?: 'vertical' | 'horizontal' }) => (
  <div className={`flex gap-2 ${layout === 'vertical' ? 'flex-col items-end' : 'flex-row items-center'}`}>
    <p className="text-xs p-1 bg-muted text-friend-box-foreground rounded-md flex items-center">Your QR code:</p>
    <div className="relative w-20 h-20">
      {qrCodeDataUrl ? (
        <Image src={qrCodeDataUrl} alt="Your QR code" fill style={{ objectFit: 'contain' }} className="rounded-lg" />
      ) : (
        // Spinner while QR code generates.
        <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center">
          <LoadingSpinner />
        </div>
      )}
    </div>
  </div>
));
YourQrCodeSection.displayName = 'YourQrCodeSection';

// Card for adding friends via UID or QR scan.
const AddFriendCard = memo<AddFriendCardProps>(({ friendUid, onFriendUidChange, onAddFriend, onCopy, user }) => {
  // Stores the generated QR code data URL.
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const { toast } = useToast();

  // Generates QR code on mount or user ID change.
  useEffect(() => {
    if (user?.uid) {
      import('qrcode').then(QRCode => {
        QRCode.toDataURL(user.uid, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          margin: 1,
          width: 128,
        })
        .then(url => {
          setQrCodeDataUrl(url);
        })
        .catch(() => {
          toast({ title: "Error", description: "Failed to generate QR code" });
        });
      });
    }
  }, [user?.uid, toast]);

  return (
    <Card className="w-full shadow-lg mt-4">
      <CardContent className="pt-6">
        <div className="bg-friend-box p-4 rounded-lg">

          {/* Desktop layout (hidden on small screens). */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_auto] sm:gap-2 sm:items-center">
            <div className="flex flex-col gap-4">
              <p className='text-start font-bold text-friend-box-foreground'>Add your friends</p>
              <div className="flex flex-row gap-2">
                <div className="flex flex-col grow gap-2">
                  <Label htmlFor="friendUid-desktop" className="sr-only">Enter your friend&apos;s ID</Label>
                  <Input
                    id="friendUid-desktop"
                    name="friendUid"
                    placeholder="Enter your friend's ID"
                    value={friendUid}
                    onChange={(e) => onFriendUidChange(e.target.value)}
                    className="h-9 italic"
                  />
                  <YourIdSection userId={user.uid} onCopy={onCopy} />
                </div>
                <div className="flex flex-col gap-2 justify-between">
                  <Button onClick={() => onAddFriend(friendUid)} size="sm" className="h-9 w-28" disabled={!friendUid}>Add friend</Button>
                  <QRCodeScannerDialog onScanSuccess={onAddFriend} small className="h-9 w-28" aria-label="Scan friend's QR code" />
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <YourQrCodeSection qrCodeDataUrl={qrCodeDataUrl} />
            </div>
          </div>

          {/* Mobile layout (visible on small screens). */}
          <div className="sm:hidden flex flex-col gap-2">
            <p className='text-start font-bold text-friend-box-foreground'>Add your friends</p>
            <div className="flex items-center gap-2">
                <Label htmlFor="friendUid-mobile" className="sr-only">Enter your friend&apos;s ID</Label>
                <Input
                    id="friendUid-mobile"
                    name="friendUid"
                    placeholder="Enter your friend's ID"
                    value={friendUid}
                    onChange={(e) => onFriendUidChange(e.target.value)}
                    className="h-9 italic grow"
                />
                <Button onClick={onCopy} size="icon" variant="default" className="h-9 w-9 shrink-0" aria-label="Copy your user ID">
                    <Clipboard className="h-4 w-4" />
                </Button>
            </div>
            <div className="flex items-stretch gap-2 h-9">
                <p className="text-xs p-1 bg-muted text-friend-box-foreground rounded-md flex items-center">Your ID:</p>
                <span className="text-xs font-mono p-1 bg-background rounded-md flex items-center justify-center flex-1">{user.uid}</span>
            </div>
            <div className="flex flex-row justify-end items-center gap-2 -mb-2">
                <div className="flex flex-col gap-2">
                    <Button onClick={() => onAddFriend(friendUid)} size="sm" className="h-9" disabled={!friendUid}>Add friend</Button>
                    <QRCodeScannerDialog onScanSuccess={onAddFriend} small className="h-9" aria-label="Scan friend's QR code" />
                </div>
                <YourQrCodeSection qrCodeDataUrl={qrCodeDataUrl} layout="horizontal" />
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
});

AddFriendCard.displayName = 'AddFriendCard';

export { AddFriendCard };